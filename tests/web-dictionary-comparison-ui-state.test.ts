import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import type { ComparisonEntry, DictionarySourceId } from '../apps/web/src/services/dictionary-comparison';
import { useDictionaryComparison } from '../apps/web/src/composables/useDictionaryComparison';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../apps/web/src/services/dictionary-comparison', () => ({
  DICTIONARY_SOURCES: [{ id: 'tomoshi' }, { id: 'jmdict' }, { id: 'wiktionary-ja' }],
  queryDictionarySource: query,
}));

interface Request {
  id: DictionarySourceId;
  term: string;
  signal: AbortSignal;
  resolve: (entries: ComparisonEntry[]) => void;
  reject: (error: Error) => void;
}
const requests: Request[] = [];
const scopes: EffectScope[] = [];

function entry(term: string): ComparisonEntry {
  return { id: term, term, readings: ['あめ'], senses: [{ definition: term }], match: 'exact' };
}

function setup(ids: DictionarySourceId[] = ['tomoshi', 'jmdict', 'wiktionary-ja']) {
  const open = ref(true);
  const search = ref({ term: '雨', reading: 'あめ', partOfSpeech: '名词' });
  const sourceIds = ref(ids);
  const owner = ref<string | null>(null);
  const scope = effectScope();
  scopes.push(scope);
  const state = scope.run(() => useDictionaryComparison({ open, query: search, sourceIds, owner }))!;
  return { ...state, open, search, sourceIds, owner, scope };
}

beforeEach(() => {
  requests.length = 0;
  query.mockReset();
  query.mockImplementation((id: DictionarySourceId, search: { term: string }, signal: AbortSignal) =>
    new Promise<ComparisonEntry[]>((resolve, reject) => { requests.push({ id, term: search.term, signal, resolve, reject }); }));
});
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop());
});

describe('dictionary comparison reading state', () => {
  it('loads sources in parallel and retries only the failed source', async () => {
    const state = setup();
    expect(requests.map(request => request.id)).toEqual(['tomoshi', 'jmdict', 'wiktionary-ja']);
    expect(state.results.tomoshi.status).toBe('loading');
    requests[0].resolve([entry('雨')]);
    requests[1].reject(new Error('not available'));
    requests[2].resolve([]);
    await nextTick();
    expect(state.results.tomoshi.status).toBe('ready');
    expect(state.results.jmdict.status).toBe('error');
    expect(state.results['wiktionary-ja'].status).toBe('empty');
    const retry = state.retrySource('jmdict');
    expect(requests).toHaveLength(4);
    expect(requests[3].id).toBe('jmdict');
    expect(state.results.tomoshi.entries[0].term).toBe('雨');
    requests[3].resolve([entry('雨')]);
    await retry;
    expect(state.results.jmdict.status).toBe('ready');
  });

  it('ignores old results after changing the word, account or closing the panel', async () => {
    const state = setup(['tomoshi']);
    const original = requests[0];
    state.search.value = { term: '飴', reading: 'あめ', partOfSpeech: '名词' };
    expect(original.signal.aborted).toBe(true);
    const second = requests[1];
    state.owner.value = 'another-account';
    expect(second.signal.aborted).toBe(true);
    const current = requests[2];
    original.resolve([entry('雨')]);
    second.reject(new Error('late response'));
    await nextTick();
    expect(state.results.tomoshi.status).toBe('loading');
    expect(state.results.tomoshi.entries).toEqual([]);
    current.resolve([entry('飴')]);
    await nextTick();
    expect(state.results.tomoshi.entries[0].term).toBe('飴');
    const closingRequest = state.retrySource('tomoshi');
    state.open.value = false;
    expect(requests[3].signal.aborted).toBe(true);
    requests[3].resolve([entry('雨')]);
    await closingRequest;
    expect(state.results.tomoshi).toEqual({ status: 'idle', entries: [] });
  });

  it('stops hidden sources and disposed panels without repeating completed sources', async () => {
    const state = setup(['tomoshi', 'jmdict']);
    requests[0].resolve([entry('雨')]);
    await nextTick();
    const hiddenRequest = requests[1];
    state.sourceIds.value = ['tomoshi'];
    expect(hiddenRequest.signal.aborted).toBe(true);
    hiddenRequest.resolve([entry('old result')]);
    await nextTick();
    expect(state.results.jmdict.status).toBe('idle');
    state.sourceIds.value = ['tomoshi', 'jmdict'];
    expect(requests).toHaveLength(3);
    expect(requests[2].id).toBe('jmdict');
    state.scope.stop();
    expect(requests[2].signal.aborted).toBe(true);
    requests[2].resolve([entry('late result')]);
    await nextTick();
    expect(state.results.jmdict.status).toBe('idle');
  });
});

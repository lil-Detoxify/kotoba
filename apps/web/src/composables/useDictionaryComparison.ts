import { onScopeDispose, reactive, watch, type Ref } from 'vue';
import {
  DICTIONARY_SOURCES,
  queryDictionarySource,
  type ComparisonEntry,
  type DictionarySourceId,
} from '../services/dictionary-comparison';

export type DictionarySourceStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export interface DictionarySourceResult {
  status: DictionarySourceStatus;
  entries: ComparisonEntry[];
}

interface ComparisonOptions {
  open: Ref<boolean>;
  query: Ref<{ term: string; reading: string; partOfSpeech?: string }>;
  sourceIds: Ref<readonly DictionarySourceId[]>;
  owner: Ref<string | null>;
}

export function useDictionaryComparison(options: ComparisonOptions) {
  const results = reactive<Record<DictionarySourceId, DictionarySourceResult>>({
    tomoshi: { status: 'idle', entries: [] },
    jmdict: { status: 'idle', entries: [] },
    'wiktionary-ja': { status: 'idle', entries: [] },
  });
  const controllers = new Map<DictionarySourceId, AbortController>();
  const sourceTickets = new Map<DictionarySourceId, number>();
  let generation = 0;

  function invalidate(): void {
    generation++;
    controllers.forEach(controller => controller.abort());
    controllers.clear();
    sourceTickets.clear();
    for (const source of DICTIONARY_SOURCES) results[source.id] = { status: 'idle', entries: [] };
  }

  async function loadSource(id: DictionarySourceId): Promise<void> {
    if (!options.open.value || !options.query.value.term.trim() || !options.sourceIds.value.includes(id)) return;
    controllers.get(id)?.abort();
    const controller = new AbortController();
    controllers.set(id, controller);
    const ticket = (sourceTickets.get(id) ?? 0) + 1;
    sourceTickets.set(id, ticket);
    const scope = generation;
    const query = { ...options.query.value };
    results[id] = { status: 'loading', entries: [] };
    const stillCurrent = () => scope === generation
      && sourceTickets.get(id) === ticket && !controller.signal.aborted && options.open.value;
    try {
      const entries = await queryDictionarySource(id, query, controller.signal);
      if (!stillCurrent()) return;
      results[id] = { status: entries.length ? 'ready' : 'empty', entries };
    } catch {
      if (!stillCurrent()) return;
      results[id] = { status: 'error', entries: [] };
    } finally {
      if (controllers.get(id) === controller) controllers.delete(id);
    }
  }

  watch([
    options.open,
    () => options.query.value.term,
    () => options.query.value.reading,
    () => options.query.value.partOfSpeech,
    options.owner,
  ], () => {
    invalidate();
    if (options.open.value) options.sourceIds.value.forEach(id => { void loadSource(id); });
  }, { immediate: true, flush: 'sync' });

  watch(options.sourceIds, ids => {
    for (const [id, controller] of controllers) {
      if (!ids.includes(id)) {
        controller.abort();
        controllers.delete(id);
        results[id] = { status: 'idle', entries: [] };
      }
    }
    if (!options.open.value) return;
    for (const id of ids) if (results[id].status === 'idle') void loadSource(id);
  }, { flush: 'sync' });

  onScopeDispose(invalidate);
  return { results, retrySource: loadSource };
}

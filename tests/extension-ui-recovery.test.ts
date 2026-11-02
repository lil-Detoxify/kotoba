import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { computed as vueComputed, nextTick as vueNextTick, ref as vueRef, watch as vueWatch } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { ExtensionWord } from '../apps/extension/src/model';
import { extensionLibraryProgress } from '../apps/extension/src/learning-analytics';
import { bookIdForWord, buildStudyQueue } from '../apps/extension/src/learning';
import { fullBookTitle } from '../apps/extension/src/book-presentation';
import { extensionDailyStudyPlan } from '../apps/extension/src/daily-study-plan';

type AppHarness = {
  accountChanged: (event: any) => void;
  activeView: { value: string };
  loading: { value: boolean };
  loadData: () => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;
  openMainView: (view: string) => void;
  saveManualWord: () => Promise<void>;
  manualDraft: { value: { term: string; reading: string; meaning: string } };
  manualDraftId: { value: string };
  manualSavedTerm: { value: string };
  rateCurrent: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  pendingReviewWrite: { value: null | { wordId: string; requestId: string; rating: 1 | 2 | 3 | 4; expectedReviewCount: number } };
  reviewRevealed: { value: boolean };
  reviewBusy: { value: boolean };
  snapshot: { value: any };
  sessionReviewedIds: { value: Set<string> };
  currentReview: { value: any };
  refreshReviewCard: () => Promise<void>;
};

function loadApp(extensionApi: Record<string, any>): AppHarness {
  const path = resolve(process.cwd(), 'apps/extension/src/App.vue');
  const descriptor = parse(readFileSync(path, 'utf8'), { filename: path }).descriptor;
  const script = compileScript(descriptor, { id: 'extension-ui-recovery-test' });
  const match = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!match) throw new Error('Unable to extract extension App.vue setup body');

  const transpiled = ts.transpileModule(match[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText;
  const sourceFile = ts.createSourceFile('extension-app-setup.js', transpiled, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const statements = sourceFile.statements.filter(statement => !ts.isImportDeclaration(statement));
  let code = ts.createPrinter().printFile(ts.factory.updateSourceFile(sourceFile, statements));
  code = code.replace(/__expose\(\);\s*/, '');
  code += '\nreturn { accountChanged, saveManualWord, manualDraft, manualDraftId, manualSavedTerm, rateCurrent, pendingReviewWrite, reviewRevealed, reviewBusy, snapshot, sessionReviewedIds, currentReview, refreshReviewCard, activeView, loading, loadData, openSettings, closeSettings, openMainView };';

  const icons = ['ArrowLeft', 'Bookmark', 'BookOpen', 'Check', 'ChevronRight', 'Download', 'ExternalLink', 'Globe2', 'LoaderCircle', 'RotateCcw', 'Search', 'Settings2', 'ShieldCheck', 'Sparkles', 'Trash2', 'X'];
  const iconStub = () => null;
  const dependencies: Record<string, unknown> = {
    extensionPackage: { version: '0.1.0' },
    extensionApi,
    ChartNoAxesCombined: () => null,
    extensionLibraryProgress,
    bookIdForWord,
    buildStudyQueue,
    extensionDailyStudyPlan,
    useHomeDisplayPreference: () => ({ display: vueRef('review'), setDisplay: vi.fn() }),
    useStudyPlanPreference: () => ({ paces: vueRef({}), getPace: () => 1, setPace: vi.fn() }),
    readStudyCheckpoint: vi.fn(() => null),
    resolveStudyCheckpoint: vi.fn(() => []),
    fullBookTitle,
    getBrowser: vi.fn(() => undefined),
    searchCatalog: vi.fn(() => []),
    useExtensionMotion: vi.fn(() => ({ animateView: vi.fn(), animateReveal: vi.fn() })),
  };
  for (const icon of icons) dependencies[icon] = iconStub;

  const names = Object.keys(dependencies);
  const runner = new Function(
    ...names,
    'ref',
    'computed',
    'watch',
    'nextTick',
    'onMounted',
    'onUnmounted',
    code,
  );
  return runner(
    ...names.map(name => dependencies[name]),
    vueRef,
    vueComputed,
    vueWatch,
    vueNextTick,
    () => {},
    () => {},
  ) as AppHarness;
}

describe('extension account display isolation', () => {
  it('clears statistics immediately while the next account snapshot is still loading', async () => {
    const first = { ...makeSnapshot(), identity: { partitionKey: 'account:first', userId: 'first' } };
    const second = { ...makeSnapshot(), identity: { partitionKey: 'account:second', userId: 'second' } };
    let finish!: (value: unknown) => void;
    const pending = new Promise(resolve => { finish = resolve; });
    const api = { loadCatalog: vi.fn(async () => []), read: vi.fn(async () => first) };
    const h = loadApp(api); await h.loadData(); h.openMainView('stats');
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.loading.value).toBe(false));
    api.read.mockImplementationOnce(() => pending as Promise<any>);
    h.accountChanged({ detail: { partitionKey: 'account:second' } });
    expect(h.snapshot.value).toBeNull(); expect(h.loading.value).toBe(true);
    await vi.waitFor(() => expect(api.read).toHaveBeenCalledTimes(3)); finish(second);
    await vi.waitFor(() => expect(h.snapshot.value?.identity?.partitionKey).toBe('account:second'));
  });
});

function makeSnapshot(words: ExtensionWord[] = [], reviewCount = 0, nextReviewAt?: string): any {
  return {
    schema: 1,
    words: words.map(word => ({
      word,
      savedAt: '2026-10-01T00:00:00.000Z',
      state: {
        userId: 'local',
        wordId: word.id,
        reviewCount,
        nextReviewAt: nextReviewAt ?? null,
        isIgnored: false,
      },
    })),
    logs: [],
    preferences: { motion: 'standard', selectedBookIds: [], selectedBookIdsExplicit: false },
    learning: { books: [], words: [], states: [], logs: [], quizAttempts: [] },
    syncQueue: [],
  };
}

function savedReviewSnapshot(wordId: string, reviewCount: number, nextReviewAt: string): any {
  const word: ExtensionWord = {
    id: wordId,
    lessonId: 'manual',
    term: '記憶',
    reading: 'きおく',
    meaning: '记忆',
    order: 0,
    source: 'manual',
    bookTitle: '我的词条',
    lessonTitle: '手动添加',
  };
  return makeSnapshot([word], reviewCount, nextReviewAt);
}

function createApi() {
  return {
    loadCatalog: vi.fn(async () => []),
    read: vi.fn(async () => makeSnapshot()),
    save: vi.fn(async (_word: ExtensionWord, _sourceHost?: string) => makeSnapshot()),
    remove: vi.fn(async (_wordId: string) => makeSnapshot()),
    rate: vi.fn(async (_wordId: string, _rating: 1 | 2 | 3 | 4, _requestId: string, _count: number) => makeSnapshot()),
    setMotion: vi.fn(async (_mode: 'standard' | 'reduced') => makeSnapshot()),
    subscribeLookup: vi.fn(() => () => {}),
  };
}

function manualDraft(harness: AppHarness, overrides: Partial<{ term: string; reading: string; meaning: string }> = {}) {
  harness.manualDraft.value = {
    term: '言葉',
    reading: 'ことば',
    meaning: 'word',
    ...overrides,
  };
}

function commitThenLoseFirstSave(api: ReturnType<typeof createApi>) {
  const stored = new Map<string, ExtensionWord>();
  api.save.mockImplementation(async word => {
    if (!stored.has(word.id)) stored.set(word.id, { ...word });
    if (api.save.mock.calls.length === 1) throw new Error('reply lost after local commit');
    return makeSnapshot([...stored.values()]);
  });
  return stored;
}

describe('extension UI recovery', () => {
  it('reuses an idempotency id when retrying an unchanged manual-word payload', async () => {
    const api = createApi();
    commitThenLoseFirstSave(api);
    const harness = loadApp(api);
    manualDraft(harness);

    await harness.saveManualWord();
    const firstWord = api.save.mock.calls[0][0];

    await harness.saveManualWord();
    const secondWord = api.save.mock.calls[1][0];

    expect(secondWord.id).toBe(firstWord.id);
    expect(secondWord).toEqual(firstWord);
    expect(harness.manualSavedTerm.value).toBe('言葉');
  });

  it('uses a fresh id after editing a manual-word payload whose first reply was lost', async () => {
    const api = createApi();
    const stored = commitThenLoseFirstSave(api);
    const harness = loadApp(api);
    manualDraft(harness);

    await harness.saveManualWord();
    const originalId = api.save.mock.calls[0][0].id;
    manualDraft(harness, { meaning: '表达意思的词语' });

    await harness.saveManualWord();

    const retriedWord = api.save.mock.calls[1][0];
    expect(retriedWord.id).not.toBe(originalId);
    expect(retriedWord.meaning).toBe('表达意思的词语');
    expect([...stored.values()]).toContainEqual(retriedWord);
    expect(harness.manualSavedTerm.value).toBe('言葉');
  });

  it('locks an ambiguous review retry to the original grade and reuses its count and request id', async () => {
    const api = createApi();
    const snapshot = savedReviewSnapshot('review-word', 2, '2000-01-01T00:00:00.000Z');
    api.rate.mockRejectedValueOnce(new Error('reply lost after local commit')).mockResolvedValue(snapshot);
    const harness = loadApp(api);
    harness.snapshot.value = snapshot;
    await vueNextTick();
    expect(harness.currentReview.value?.saved.word.id).toBe('review-word');
    harness.reviewRevealed.value = true;

    await harness.rateCurrent(3);
    const firstArgs = api.rate.mock.calls[0];
    expect(harness.pendingReviewWrite.value).toMatchObject({
      wordId: 'review-word',
      rating: 3,
      expectedReviewCount: 2,
      requestId: firstArgs[2],
    });

    await harness.rateCurrent(4);
    expect(api.rate).toHaveBeenCalledTimes(1);

    await harness.rateCurrent(3);
    expect(api.rate).toHaveBeenCalledTimes(2);
    expect(api.rate.mock.calls[1]).toEqual(firstArgs);
  });

  it('refreshes an advanced review state and skips the already-processed card', async () => {
    const api = createApi();
    const stale = savedReviewSnapshot('review-word', 2, '2000-01-01T00:00:00.000Z');
    const refreshed = savedReviewSnapshot('review-word', 3, new Date(Date.now() + 86_400_000).toISOString());
    api.rate.mockRejectedValueOnce(new Error('stale review count'));
    api.read.mockResolvedValue(refreshed);
    const harness = loadApp(api);
    harness.snapshot.value = stale;
    await vueNextTick();
    expect(harness.currentReview.value?.saved.word.id).toBe('review-word');
    harness.reviewRevealed.value = true;

    await harness.rateCurrent(2);
    expect(api.rate).toHaveBeenCalledTimes(1);

    await harness.refreshReviewCard();

    expect(api.read).toHaveBeenCalledTimes(1);
    expect(harness.snapshot.value).toMatchObject(refreshed);
    expect(harness.pendingReviewWrite.value).toBeNull();
    expect(harness.sessionReviewedIds.value.has('review-word')).toBe(true);
    expect(harness.currentReview.value).toBeNull();

    await harness.rateCurrent(2);
    expect(api.rate).toHaveBeenCalledTimes(1);
  });
});





describe('extension learning and settings navigation', () => {
  it('returns from account settings to the selected learning tab', async () => {
    const h = loadApp(createApi()); h.openMainView('learning'); await vueNextTick();
    h.openSettings(); expect(h.activeView.value).toBe('settings');
    h.closeSettings();
    expect(h.activeView.value).toBe('learning');
  });
  it('ignores a superseded shell read failure after quickly returning to learning', async () => {
    const api = createApi(); let reject!: (error: Error) => void;
    api.read.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const h = loadApp(api); h.snapshot.value = makeSnapshot();
    const reading = h.loadData(); h.activeView.value = 'learning'; await vueNextTick();
    reject(new Error('stale read')); await reading;
    expect(h.snapshot.value).not.toBeNull(); expect(h.loading.value).toBe(false);
  });
});

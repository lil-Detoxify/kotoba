import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { computed as vueComputed, nextTick as vueNextTick, reactive as vueReactive, ref as vueRef, toRaw as vueToRaw, watch as vueWatch } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { bookIdForWord, buildStudyQueue, listLearningBooks, summarizeLearning } from '../apps/extension/src/learning';
import type { ExtensionWord } from '../apps/extension/src/model';
import { bookCategory, fullBookTitle } from '../apps/extension/src/book-presentation';
import { extensionDailyStudyPlan } from '../apps/extension/src/daily-study-plan';
import { extensionLibraryProgress } from '../apps/extension/src/learning-analytics';
import { createInputQuestion, inputAttempt } from '../apps/web/src/services/kana-input';
import { createSentenceCloze, matchesClozeExample } from '../apps/web/src/services/sentence-cloze';
import { learningScenes } from '../apps/web/src/services/learning-scenes';
import { webTextbookWordId } from '../apps/web/src/services/textbook-catalog';
import { resolveStudyCheckpoint, createStudyCheckpointStore } from '../apps/extension/src/study-checkpoint';
import { sceneStudyQueue, sceneExampleFor, sceneFor } from '../apps/extension/src/learning-content';
import { extensionContentWords, personalLibraryData } from '../apps/extension/src/personal-library';
import { extensionSessionSummary, extensionWeakPracticeSuggestions, feedbackPracticeQueue } from '../apps/extension/src/study-feedback';
import { extensionPracticeFeedback } from '../apps/extension/src/library-reports';
import { contextClozeExample } from '../apps/web/src/services/personal-learning-example';
import { wordReadingContexts } from '../apps/web/src/services/reading-context';
import { lessonPracticeRecommendation } from '../apps/web/src/services/lesson-practice-recommendation';
import { meaningOptionLabels } from '../apps/web/src/services/meaning-presentation';

type Harness = Record<string, any>;

function loadWorkspace(extensionApi: Record<string, any>, pace: 0.5 | 1 = 1, checkpointOverrides: Record<string, any> = {}): Harness {
  const path = resolve(process.cwd(), 'apps/extension/src/LearningWorkspace.vue');
  const descriptor = parse(readFileSync(path, 'utf8'), { filename: path }).descriptor;
  const script = compileScript(descriptor, { id: 'extension-learning-workspace-test' });
  const match = script.content.match(/setup\(__props(?:: any)?(?:, \{[^}]*\})?\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!match) throw new Error('Unable to extract LearningWorkspace.vue setup body');

  const transpiled = ts.transpileModule(match[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const sourceFile = ts.createSourceFile('learning-workspace-setup.js', transpiled, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const statements = sourceFile.statements.filter(statement => !ts.isImportDeclaration(statement));
  let code = ts.createPrinter().printFile(ts.factory.updateSourceFile(sourceFile, statements));
  code = code.replace(/__expose\(\);\s*/, '');
  code += '\nreturn { previousWord, returnToCurrent, historyWords, reviewIndex, reviewWord, canPrevious, resetCard, saveQuizAttempt, selectedBookIds, activeBookProgress, dailyPlan, catalogWords, useBook, snapshot, queue, index, sessionMode, sessionSceneId, sessionReadingContextIds, relatedPractice, revealed, savedCheckpoint, activeQuestion, activeQuestionType, inputQuestion, inputValue, clozeQuestion, clozeValue, objectiveQuestion, hasHeardAudio, attempt, attemptRequestId, attemptElapsedMs, attemptSaved, attemptBusy, attemptError, pendingGrade, pendingGradeRequestId, pendingGradeExpectedCount, pendingGradeElapsedMs, staleReview, gradeError, sessionResults, lastIgnored, page, actionMessage, actionError, audioNotice, rateCurrent, startDailyPlan, startSession, startPersonalContextPractice, practiceRecommended, resumeCheckpoint, saveCheckpoint, chooseAnswer, submitInputAnswer, revealCloze, changeExercise, saveQuizAttempt, refreshCurrentCard, ignoreCurrent, undoIgnore, accountChanged, keydown, stop, loadWorkspace, loading, playAnswerSound, playCurrent, stopFeedbackWhenHidden, autoSpeechHandled, autoSpeakCurrent, autoPronunciationEnabled };';

  code = code.replace('return { previousWord,', 'return { weakSuggestions, startHistoricalPractice, handleLaunchRequest, sessionFeedbackPractice, previousWord,');
  const writeCheckpoint = vi.fn(() => true);
  const readCheckpoint = checkpointOverrides.read ?? vi.fn(() => null);
  const resolveCheckpoint = checkpointOverrides.resolve ?? vi.fn(() => []);

  const makeQuestion = vi.fn(() => null);
  const autoPronunciationEnabled = vueRef(true);
  const playPronunciation = vi.fn(async () => true);
  const stopPronunciation = vi.fn();
  const prefetchPronunciation = vi.fn();
  const clearPrefetchPronunciation = vi.fn();
  const dependencies: Record<string, unknown> = {
    extensionPackage: { version: '0.2.0' },
    AccountPanel: {},
    extensionApi,
    createQuestion: makeQuestion,
    quizAttempt: (question: any, selected: string | null) => ({
      type: question.type,
      prompt: question.prompt,
      options: [...question.options],
      selected,
      correct: question.correct,
      isCorrect: selected === question.correct,
    }),
    quizRating: (attempt: any) => attempt.isCorrect ? 3 : 1,
    toHiragana: (value: string) => value,
    createInputQuestion,
    inputAttempt,
    createSentenceCloze,
    matchesClozeExample,
    sceneStudyQueue,
    sceneExampleFor,
    sceneFor,
    loadBookLearningExamples: vi.fn(async () => true),
    personalClozeExampleFor: (word: any, contextId?: string) => {
      const contexts = wordReadingContexts(word);
      const preferred = contexts.find(context => context.id === contextId);
      if (preferred) {
        const example = contextClozeExample(word, preferred);
        if (example) return { context: preferred, example };
      }
      for (const context of contexts) {
        const example = contextClozeExample(word, context);
        if (example) return { context, example };
      }
      return undefined;
    },
    contextClozeExample,
    wordReadingContexts,
    personalLibraryData,
    lessonPracticeRecommendation,
    meaningOptionLabels,
    playAnswerSound: vi.fn(async () => true),
    stopAnswerSound: vi.fn(),
    createExtensionPronunciation: () => ({
      play: playPronunciation,
      stop: stopPronunciation,
      prefetch: prefetchPronunciation,
      clearPrefetch: clearPrefetchPronunciation,
      setVoice: vi.fn(),
      voice: vueRef<'female' | 'male'>('female'),
      playing: vueRef(false),
      error: vueRef(''),
    }),
    bookIdForWord,
    buildStudyQueue,
    extensionDailyStudyPlan,
    extensionContentWords,
    extensionSessionSummary,
    extensionWeakPracticeSuggestions,
    feedbackPracticeQueue,
    extensionPracticeFeedback,
    useStudyPlanPreference: () => ({ paces: vueRef({}), getPace: () => pace, setPace: vi.fn() }),
    useAutoPronunciationPreference: () => ({ enabled: autoPronunciationEnabled, setEnabled: (value: boolean) => { autoPronunciationEnabled.value = value; } }),
    readStudyCheckpoint: readCheckpoint,
    writeStudyCheckpoint: checkpointOverrides.write ?? writeCheckpoint,
    resolveStudyCheckpoint: resolveCheckpoint,
    listLearningBooks,
    bookCategory,
    fullBookTitle,
    extensionLibraryProgress,
    summarizeLearning,
    useExtensionMotion: vi.fn(() => ({ animateView: vi.fn(), animateReveal: vi.fn() })),
  };
  const names = Object.keys(dependencies);
  const activated: Array<() => void> = [];
  const deactivated: Array<() => void> = [];
  const emit = vi.fn();
  const runner = new Function(...names, '__emit', '__props', 'ref', 'computed', 'reactive', 'watch', 'nextTick', 'onMounted', 'onUnmounted', 'onActivated', 'onDeactivated', code);
  const harness = runner(
    ...names.map(name => dependencies[name]),
    emit,
    { launchRequest: null },
    vueRef,
    vueComputed,
    vueReactive,
    vueWatch,
    vueNextTick,
    () => {},
    () => {},
    (callback: () => void) => activated.push(callback),
    (callback: () => void) => deactivated.push(callback),
  ) as Harness;
  return { ...harness, emit, playPronunciation, stopPronunciation, prefetchPronunciation, clearPrefetchPronunciation, writeCheckpoint, readCheckpoint, resolveCheckpoint, activate: () => activated.forEach(callback => callback()), deactivate: () => deactivated.forEach(callback => callback()) };
}

function makeWord(id: string, order: number): ExtensionWord {
  return {
    id,
    lessonId: 'biaori-beginner-upper-l-1',
    term: id === 'word-a' ? '言葉' : id === 'word-b' ? '毎日' : '記憶',
    reading: id === 'word-a' ? 'ことば' : id === 'word-b' ? 'まいにち' : 'きおく',
    meaning: id === 'word-a' ? '词语' : id === 'word-b' ? '每天' : '记忆',
    order,
    source: 'textbook',
    bookTitle: '标日初级上',
    lessonTitle: '第1课',
  };
}

function makeState(word: ExtensionWord, reviewCount = 0) {
  return {
    userId: 'local', wordId: word.id, status: reviewCount ? 'learning' : 'new',
    isIgnored: false, isDifficult: false, reviewCount, lapseCount: 0,
    firstSeenAt: reviewCount ? '2026-10-01T00:00:00.000Z' : undefined,
    nextReviewAt: undefined, card: {},
  } as any;
}

function makeReadingContext(id: string, sentence: string) {
  return {
    id,
    sentence,
    matchedText: '言葉',
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
  };
}

function makeSnapshot(words: ExtensionWord[], states = words.map(word => makeState(word))) {
  return {
    schema: 1,
    words: [],
    logs: [],
    preferences: { motion: 'standard', dailyGoal: 20, voice: 'female', exerciseType: 'card', selectedBookIds: [], selectedBookIdsExplicit: false },
    learning: { books: [], words, states, logs: [], quizAttempts: [] },
    syncQueue: [],
    identity: { partitionKey: 'guest:default', userId: 'local' },
  };
}

function realSceneCatalog(): ExtensionWord[] {
  const words: ExtensionWord[] = [];
  const bookIds = new Set(learningScenes.flatMap(scene => scene.items.map(item => item.bookId)));
  for (const bookId of bookIds) {
    const book = JSON.parse(readFileSync(resolve(process.cwd(), 'apps/web/public/data/books', `${bookId}.json`), 'utf8'));
    for (const lesson of book.lessons) {
      const lessonId = `${bookId}-l-${lesson.order}`;
      lesson.words.forEach((sourceWord: any, index: number) => words.push({
        ...sourceWord,
        id: webTextbookWordId(bookId, lesson.order, sourceWord, index),
        lessonId,
        order: index,
        source: 'textbook',
        bookTitle: book.title,
        lessonTitle: lesson.title,
      }));
    }
  }
  return words;
}

function createApi(snapshot: any) {
  type RateMode = 'new' | 'review' | 'difficult';
  type QuizAttemptInput = {
    requestId: string;
    wordId: string;
    type: string;
    prompt: string;
    options: string[];
    selected: string | null;
    correct: string;
    elapsedMs: number;
  };
  return {
    loadCatalog: vi.fn(async () => snapshot.learning.words),
    read: vi.fn(async () => snapshot),
    setLearningFlags: vi.fn(async (wordId: string, patch: Record<string, boolean>) => {
      const next = structuredClone(snapshot);
      const state = next.learning.states.find((item: any) => item.wordId === wordId);
      Object.assign(state, patch);
      return next;
    }),
    rateLearning: vi.fn(async (
      _wordId: string,
      _rating: number,
      _requestId: string,
      _expectedReviewCount: number,
      _mode: RateMode,
      _elapsedMs: number,
      _quizRequestId?: string,
      _sceneId?: string,
    ) => snapshot),
    recordQuizAttempt: vi.fn(async (_attempt: QuizAttemptInput) => snapshot),
  };
}

function prepareCard(harness: Harness, words: ExtensionWord[]) {
  const states = words.map(word => makeState(word, word.id === 'word-b' ? 2 : 0));
  harness.snapshot.value = makeSnapshot(words, states);
  harness.queue.value = words.map((word, index) => ({ word, state: states[index] }));
  harness.index.value = 0;
  harness.sessionMode.value = 'new';
  harness.revealed.value = true;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flushHarnessPromises(turns = 8) {
  for (let turn = 0; turn < turns; turn++) await Promise.resolve();
}

describe('extension learning workspace recovery', () => {
  it('starts fill practice with the selected personal original and saves one rating', async () => {
    const word = { ...makeWord('word-a', 1), readingContexts: [
      makeReadingContext('context-first', '毎日、言葉を学ぶ。'),
      makeReadingContext('context-selected', '昨日、言葉を書き留めた。'),
    ] };
    const initial = makeSnapshot([word]);
    const api: any = createApi(initial);
    const h = loadWorkspace(api);
    h.snapshot.value = initial;
    h.catalogWords.value = [word];
    h.loading.value = false;
    h.autoPronunciationEnabled.value = false;

    await h.startPersonalContextPractice({
      id: 1,
      owner: initial.identity.partitionKey,
      kind: 'personal-context',
      readingContextIds: { [word.id]: 'context-selected' },
    });

    expect(h.sessionReadingContextIds.value).toEqual({ [word.id]: 'context-selected' });
    expect(h.snapshot.value.preferences.exerciseType).toBe('card');
    expect(h.clozeQuestion.value?.ja).toBe('昨日、言葉を書き留めた。');
    expect(h.writeCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      exercise: 'sentence-cloze',
      readingContextIds: { [word.id]: 'context-selected' },
    }));

    h.revealed.value = true;
    await h.rateCurrent(3);
    await h.rateCurrent(3);
    expect(api.rateLearning).toHaveBeenCalledOnce();
    expect(api.rateLearning.mock.calls[0][9]).toBe('context-selected');
    expect(h.sessionResults.value).toHaveLength(1);
  });

  it('does not replace a stale personal original with another saved context', async () => {
    const word = { ...makeWord('word-a', 1), readingContexts: [makeReadingContext('still-valid', '言葉を覚える。')] };
    const initial = makeSnapshot([word]);
    const api: any = createApi(initial);
    api.setExerciseType = vi.fn(async () => initial);
    const h = loadWorkspace(api);
    h.snapshot.value = initial;
    h.catalogWords.value = [word];
    h.loading.value = false;

    await h.startPersonalContextPractice({
      id: 1,
      owner: initial.identity.partitionKey,
      kind: 'personal-context',
      readingContextIds: { [word.id]: 'deleted-context' },
    });

    expect(h.actionError.value).toContain('已更新');
    expect(api.setExerciseType).not.toHaveBeenCalled();
    expect(h.queue.value).toEqual([]);
  });

  it('routes a completion recommendation into practice without rating or changing the active queue', () => {
    const word = makeWord('word-a', 1);
    const initial = makeSnapshot([word]);
    const h = loadWorkspace(createApi(initial));
    h.snapshot.value = initial;
    h.catalogWords.value = [word];
    h.queue.value = [{ word, state: initial.learning.states[0] }];
    const scene = learningScenes.find(item => item.id === 'shopping')!;
    const queueBefore = JSON.stringify(h.queue.value);
    const resultsBefore = [...h.sessionResults.value];

    h.practiceRecommended({ kind: 'scene', scene, words: [word] as any, href: '/scenes/shopping' });

    expect(h.emit).toHaveBeenCalledWith('practice', 'scenes', undefined, scene.id);
    expect(JSON.stringify(h.queue.value)).toBe(queueBefore);
    expect(h.sessionResults.value).toEqual(resultsBefore);
  });

  it('automatically speaks the first word and each next word only once', async () => {
    vi.useFakeTimers();
    try {
    const words = [makeWord('word-a', 1), makeWord('word-b', 2), makeWord('word-c', 3)];
    const snapshot = makeSnapshot(words);
    const h = loadWorkspace(createApi(snapshot));
    h.snapshot.value = snapshot;
    h.loading.value = false;

    await h.startSession(words.map((word, index) => ({ word, state: snapshot.learning.states[index] })), 'new');
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);
    h.autoSpeakCurrent();
    h.autoSpeakCurrent();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);

    h.revealed.value = true;
    await h.rateCurrent(3);
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(750);
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(2);
    h.autoSpeakCurrent();
    expect(h.playPronunciation).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not repeat the first word pronunciation when restoring a checkpoint', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const checkpoint = { version: 1, owner: 'guest:default', bookIds: [], wordIds: [word.id], reviewCounts: [0], mode: 'new', exercise: 'card' } as any;
    const h = loadWorkspace(createApi(snapshot), 1, {
      read: vi.fn(() => checkpoint),
      resolve: vi.fn(() => [{ word, state: snapshot.learning.states[0] }]),
    });
    h.snapshot.value = snapshot;
    h.loading.value = false;

    await h.resumeCheckpoint();
    await flushHarnessPromises();
    expect(h.page.value).toBe('study');
    expect(h.playPronunciation).not.toHaveBeenCalled();
  });

  it('waits for answers on kanji reading, kana input, and sentence cloze', async () => {
    vi.useFakeTimers();
    try {
    const word = { ...makeWord('word-a', 1), term: '言葉', reading: 'ことば', example: '言葉を使う。' };
    const snapshot = makeSnapshot([word]);
    const h = loadWorkspace(createApi(snapshot));
    h.snapshot.value = snapshot;
    h.queue.value = [{ word, state: snapshot.learning.states[0] }];
    h.page.value = 'study';
    h.activeQuestion.value = { type: 'kanji-reading', prompt: word.term, options: ['ことば', 'まいにち'], correct: 'ことば' } as any;
    h.activeQuestionType.value = 'kanji-reading';
    h.autoSpeakCurrent();
    expect(h.playPronunciation).not.toHaveBeenCalled();
    h.chooseAnswer('ことば');
    expect(h.playAnswerSound).toHaveBeenCalledWith(true);
    expect(h.playPronunciation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);

    h.playPronunciation.mockClear();
    h.autoSpeechHandled.clear();
    snapshot.preferences.exerciseType = 'kana-input';
    h.resetCard();
    h.autoSpeakCurrent();
    expect(h.playPronunciation).not.toHaveBeenCalled();
    h.submitInputAnswer('ことば');
    expect(h.playPronunciation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);

    h.playPronunciation.mockClear();
    h.autoSpeechHandled.clear();
    snapshot.preferences.exerciseType = 'sentence-cloze';
    h.resetCard();
    h.clozeQuestion.value = {} as any;
    h.autoSpeakCurrent();
    expect(h.playPronunciation).not.toHaveBeenCalled();
    h.revealCloze();
    expect(h.playPronunciation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the reveal delay when automatic pronunciation is disabled', async () => {
    vi.useFakeTimers();
    try {
      const word = makeWord('word-a', 1);
      const snapshot = makeSnapshot([word]);
      const h = loadWorkspace(createApi(snapshot));
      h.snapshot.value = snapshot;
      h.queue.value = [{ word, state: snapshot.learning.states[0] }];
      h.page.value = 'study';
      h.activeQuestion.value = { type: 'kanji-reading', prompt: word.term, options: [word.reading], correct: word.reading } as any;
      h.activeQuestionType.value = 'kanji-reading';

      h.chooseAnswer(word.reading);
      expect(h.playAnswerSound).toHaveBeenCalledWith(true);
      expect(h.playPronunciation).not.toHaveBeenCalled();
      h.stopPronunciation.mockClear();
      h.autoPronunciationEnabled.value = false;
      await vueNextTick();
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.playPronunciation).not.toHaveBeenCalled();
      expect(h.stopPronunciation).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the reveal delay when the learning workspace is hidden', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', { hidden: true });
    try {
      const word = makeWord('word-a', 1);
      const snapshot = makeSnapshot([word]);
      const h = loadWorkspace(createApi(snapshot));
      h.snapshot.value = snapshot;
      h.queue.value = [{ word, state: snapshot.learning.states[0] }];
      h.page.value = 'study';
      h.activeQuestion.value = { type: 'kanji-reading', prompt: word.term, options: [word.reading], correct: word.reading } as any;
      h.activeQuestionType.value = 'kanji-reading';

      h.chooseAnswer(word.reading);
      expect(h.playPronunciation).not.toHaveBeenCalled();
      h.stopFeedbackWhenHidden();
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.playPronunciation).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('automatically satisfies the heard gate for audio choice and dictation', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const h = loadWorkspace(createApi(snapshot));
    h.snapshot.value = snapshot;
    h.queue.value = [{ word, state: snapshot.learning.states[0] }];
    h.page.value = 'study';
    h.activeQuestionType.value = 'audio-meaning';

    h.autoSpeakCurrent();
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(1);
    expect(h.hasHeardAudio.value).toBe(true);

    h.autoSpeechHandled.clear();
    h.hasHeardAudio.value = false;
    h.inputQuestion.value = { type: 'dictation' } as any;
    h.autoSpeakCurrent();
    await flushHarnessPromises();
    expect(h.playPronunciation).toHaveBeenCalledTimes(2);
    expect(h.hasHeardAudio.value).toBe(true);
  });

  it('keeps manual pronunciation available when automatic pronunciation is disabled', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const h = loadWorkspace(createApi(snapshot));
    h.snapshot.value = snapshot;
    h.queue.value = [{ word, state: snapshot.learning.states[0] }];
    h.page.value = 'study';
    h.autoPronunciationEnabled.value = false;
    h.autoSpeakCurrent();
    expect(h.playPronunciation).not.toHaveBeenCalled();

    await h.playCurrent();
    expect(h.playPronunciation).toHaveBeenCalledOnce();
  });

  it('cancels an automatic request that has not started when the setting is disabled', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const h = loadWorkspace(createApi(snapshot));
    const pending = deferred<boolean>();
    h.playPronunciation.mockReturnValue(pending.promise);
    h.snapshot.value = snapshot;
    h.queue.value = [{ word, state: snapshot.learning.states[0] }];
    h.page.value = 'study';

    h.autoSpeakCurrent();
    expect(h.playPronunciation).toHaveBeenCalledOnce();
    h.autoPronunciationEnabled.value = false;
    await vueNextTick();
    expect(h.stopPronunciation).toHaveBeenCalledOnce();
    pending.resolve(false);
    await flushHarnessPromises();
  });

  it('opens historical wrong words in their original exercise without changing the selected book or flags', async () => {
    const word = makeWord('word-a', 1);
    const initial = makeSnapshot([word], [makeState(word, 1)]);
    initial.learning.logs = [{ id: 'old-wrong', userId: 'local', wordId: word.id, rating: 3, studyMode: 'new', reviewedAt: new Date(Date.now() - 9 * 86400000).toISOString(), previousState: makeState(word), newState: makeState(word, 1), quiz: { type: 'kana-input', prompt: word.term, options: [], selected: 'ことは', correct: word.reading, isCorrect: false } }] as any;
    const api: any = createApi(initial);
    api.setExerciseType = vi.fn(async (type: string) => ({ ...initial, preferences: { ...initial.preferences, exerciseType: type } }));
    const h = loadWorkspace(api);
    h.snapshot.value = initial;
    h.catalogWords.value = [word];
    h.loading.value = false;
    await h.startHistoricalPractice({ id: 1, owner: initial.identity.partitionKey, kind: 'feedback', bookId: 'biaori-beginner-upper', exercise: 'kana-input', range: 30 });
    expect(api.setExerciseType).toHaveBeenCalledWith('kana-input');
    expect(h.queue.value.map((item: any) => item.word.id)).toEqual([word.id]);
    expect(h.sessionFeedbackPractice.value).toBe(true);
    expect(h.inputQuestion.value.type).toBe('kana-input');
    expect(h.queue.value[0].state.isDifficult).toBe(false);
    expect(api.setLearningFlags).not.toHaveBeenCalled();
    expect(h.snapshot.value.preferences.selectedBookIds).toEqual(initial.preferences.selectedBookIds);
  });

  it('rechecks wrong-answer history after saving the exercise preference', async () => {
    const word = makeWord('word-a', 1);
    const initial = makeSnapshot([word], [makeState(word, 1)]);
    const wrong = { id: 'wrong', userId: 'local', wordId: word.id, rating: 3, studyMode: 'new', reviewedAt: new Date(Date.now() - 1000).toISOString(), previousState: makeState(word), newState: makeState(word, 1), quiz: { type: 'kana-input', prompt: word.term, options: [], selected: 'ことは', correct: word.reading, isCorrect: false } };
    initial.learning.logs = [wrong] as any;
    const api: any = createApi(initial);
    api.setExerciseType = vi.fn(async () => ({ ...initial, preferences: { ...initial.preferences, exerciseType: 'kana-input' }, learning: { ...initial.learning, logs: [wrong, { ...wrong, id: 'corrected-elsewhere', reviewedAt: new Date().toISOString(), quiz: { ...wrong.quiz, selected: word.reading, isCorrect: true } }] } }));
    const h = loadWorkspace(api);
    h.snapshot.value = initial;
    h.catalogWords.value = [word];
    h.loading.value = false;
    await h.startHistoricalPractice({ id: 1, owner: initial.identity.partitionKey, kind: 'feedback', bookId: 'biaori-beginner-upper', exercise: 'kana-input', range: 7 });
    expect(h.queue.value).toEqual([]);
    expect(h.actionMessage.value).toContain('当前没有需要重练');
  });

  it('shows a freshly saved weak word immediately without reloading the workspace', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-16T08:00:00.000Z'));
      const word = makeWord('word-a', 1);
      const initial = makeSnapshot([word]);
      const h = loadWorkspace(createApi(initial));
      h.snapshot.value = initial;
      h.catalogWords.value = [word];
      expect(h.weakSuggestions.value).toEqual([]);
      vi.setSystemTime(new Date('2026-10-16T08:01:00.000Z'));
      const previous = makeState(word);
      const current = { ...makeState(word, 1), firstSeenAt: new Date().toISOString() };
      const graded = makeSnapshot([word], [current]);
      graded.learning.logs = [{ id: 'just-saved', userId: 'local', wordId: word.id, rating: 1, studyMode: 'new', reviewedAt: new Date().toISOString(), previousState: previous, newState: current }] as any;
      h.snapshot.value = graded;
      expect(h.weakSuggestions.value.map((entry: any) => entry.word.id)).toEqual([word.id]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts a 29-word half-lesson queue from a 57-word first lesson', async () => {
    const words = Array.from({ length: 57 }, (_, index) => makeWord(`lesson-word-${index}`, index));
    const snapshot = makeSnapshot(words, words.map(word => makeState(word)));
    const api = createApi(snapshot);
    const harness = loadWorkspace(api, 0.5);
    harness.snapshot.value = snapshot;
    harness.catalogWords.value = words;
    harness.loading.value = false;

    await harness.startDailyPlan('biaori-beginner-upper');

    expect(harness.queue.value).toHaveLength(29);
    expect(harness.queue.value.map((item: any) => item.word.id)).toEqual(words.slice(0, 29).map(word => word.id));
  });

  it('writes only the remaining checkpoint after a successful grade and does not advance on failure', async () => {
    const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
    const states = words.map(word => makeState(word));
    const snapshot = makeSnapshot(words, states);
    const api = createApi(snapshot);
    api.rateLearning.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(snapshot);
    const harness = loadWorkspace(api);
    harness.snapshot.value = snapshot;
    harness.loading.value = false;

    await harness.startSession(words.map((word, index) => ({ word, state: states[index] })), 'new');
    expect(harness.writeCheckpoint).toHaveBeenCalledTimes(1);
    expect(harness.savedCheckpoint.value.wordIds).toEqual(['word-a', 'word-b']);
    harness.revealed.value = true;

    await harness.rateCurrent(3);

    expect(harness.index.value).toBe(0);
    expect(harness.writeCheckpoint).toHaveBeenCalledTimes(1);
    expect(harness.savedCheckpoint.value.wordIds).toEqual(['word-a', 'word-b']);

    await harness.rateCurrent(3);

    expect(harness.index.value).toBe(1);
    expect(harness.writeCheckpoint).toHaveBeenCalledTimes(2);
    expect(harness.writeCheckpoint.mock.calls[1][0].wordIds).toEqual(['word-b']);
    expect(harness.savedCheckpoint.value.wordIds).toEqual(['word-b']);
  });

  it('retries an ambiguous FSRS write with the original grade, count, elapsed time, and ids', async () => {
    const word = makeWord('word-a', 1);
    const state = makeState(word, 4);
    const snapshot = makeSnapshot([word], [state]);
    const api = createApi(snapshot);
    api.rateLearning.mockRejectedValueOnce(new Error('reply lost after commit')).mockResolvedValueOnce(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.queue.value[0].state = state;

    await harness.rateCurrent(3);
    const firstRequest = api.rateLearning.mock.calls[0];
    expect(harness.pendingGrade.value).toBe(3);
    expect(harness.pendingGradeExpectedCount.value).toBe(4);
    expect(harness.pendingGradeRequestId.value).toBe(firstRequest[2]);

    await harness.rateCurrent(4);
    expect(api.rateLearning).toHaveBeenCalledTimes(1);

    await harness.rateCurrent(3);
    expect(api.rateLearning).toHaveBeenCalledTimes(2);
    expect(api.rateLearning.mock.calls[1]).toEqual(firstRequest);
    expect(harness.sessionResults.value).toHaveLength(1);
  });

  it('retries a lost quiz-attempt response with the identical request payload and elapsed time', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const api = createApi(snapshot);
    api.recordQuizAttempt.mockRejectedValueOnce(new Error('reply lost after commit')).mockResolvedValueOnce(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.activeQuestion.value = {
      type: 'kana-meaning', prompt: 'ことば', options: ['词语', '每天'], correct: '词语',
    };
    harness.activeQuestionType.value = 'kana-meaning';
    const now = vi.spyOn(Date, 'now').mockReturnValue(12_000);

    try {
      harness.chooseAnswer('词语');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(harness.attemptError.value).toBe('reply lost after commit');
      expect(api.recordQuizAttempt).toHaveBeenCalledTimes(1);
      const firstAttempt = api.recordQuizAttempt.mock.calls[0][0];
      expect(firstAttempt.elapsedMs).toBe(12_000);
      expect(harness.attemptElapsedMs.value).toBe(12_000);

      now.mockReturnValue(45_000);
      await harness.saveQuizAttempt();

      expect(api.recordQuizAttempt).toHaveBeenCalledTimes(2);
      expect(api.recordQuizAttempt.mock.calls[1][0]).toEqual(firstAttempt);
      expect(harness.attemptSaved.value).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  it('saves a kana-input attempt before FSRS rating and links the same attempt request id', async () => {
    const word = { ...makeWord('word-a', 1), term: '言葉', reading: 'ことば' };
    const snapshot = makeSnapshot([word]);
    snapshot.preferences.exerciseType = 'kana-input';
    const api = createApi(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.snapshot.value = snapshot;
    harness.resetCard();

    expect(harness.inputQuestion.value).toMatchObject({ type: 'kana-input', correct: 'ことば' });
    harness.submitInputAnswer('コトバ');
    expect(api.rateLearning).not.toHaveBeenCalled();
    await flushHarnessPromises();

    expect(api.recordQuizAttempt).toHaveBeenCalledOnce();
    expect(api.recordQuizAttempt.mock.calls[0][0]).toMatchObject({
      type: 'kana-input', options: [], selected: 'コトバ', correct: 'ことば'
    });
    expect(harness.attemptSaved.value).toBe(true);
    const attemptRequestId = api.recordQuizAttempt.mock.calls[0][0].requestId;

    await harness.rateCurrent(3);

    expect(api.rateLearning).toHaveBeenCalledOnce();
    expect(api.rateLearning.mock.calls[0][6]).toBe(attemptRequestId);
  });

  it('locks exercise changes while an input attempt is in study, then allows changing from home after rating', async () => {
    const word = { ...makeWord('word-a', 1), term: '言葉', reading: 'ことば' };
    const snapshot = makeSnapshot([word]);
    snapshot.preferences.exerciseType = 'kana-input';
    const api = createApi(snapshot);
    api.setExerciseType = vi.fn(async (exerciseType: string) => ({
      ...snapshot,
      preferences: { ...snapshot.preferences, exerciseType },
    }));
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.snapshot.value = snapshot;
    harness.resetCard();
    harness.page.value = 'study';

    harness.submitInputAnswer('ことば');
    await flushHarnessPromises();
    expect(harness.attemptSaved.value).toBe(true);
    await harness.changeExercise('dictation');
    expect(api.setExerciseType).not.toHaveBeenCalled();

    await harness.rateCurrent(3);
    expect(harness.page.value).toBe('summary');
    harness.page.value = 'home';
    expect(harness.attempt.value).not.toBeNull();
    await harness.changeExercise('dictation');

    expect(api.setExerciseType).toHaveBeenCalledOnce();
    expect(api.setExerciseType).toHaveBeenCalledWith('dictation');
    expect(harness.snapshot.value.preferences.exerciseType).toBe('dictation');
  });

  it('does not submit dictation before the learner has heard the word', async () => {
    const word = { ...makeWord('word-a', 1), term: '言葉', reading: 'ことば' };
    const snapshot = makeSnapshot([word]);
    snapshot.preferences.exerciseType = 'dictation';
    const api = createApi(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.snapshot.value = snapshot;
    harness.resetCard();

    expect(harness.inputQuestion.value).toMatchObject({ type: 'dictation', correct: 'ことば' });
    expect(harness.hasHeardAudio.value).toBe(false);
    harness.submitInputAnswer('ことば');

    expect(harness.attempt.value).toBeNull();
    expect(api.recordQuizAttempt).not.toHaveBeenCalled();
    expect(api.rateLearning).not.toHaveBeenCalled();
  });

  it('reveals sentence cloze without an objective attempt and allows manual FSRS rating', async () => {
    const word = {
      ...makeWord('word-a', 1), term: '言葉', reading: 'ことば',
      example: '言葉を使う。', exampleReading: 'ことばをつかう。', exampleTranslation: '使用词语。'
    };
    const snapshot = makeSnapshot([word]);
    snapshot.preferences.exerciseType = 'sentence-cloze';
    const api = createApi(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);
    harness.snapshot.value = snapshot;
    harness.resetCard();

    expect(harness.clozeQuestion.value).not.toBeNull();
    harness.revealCloze();
    expect(harness.revealed.value).toBe(true);
    expect(api.recordQuizAttempt).not.toHaveBeenCalled();

    await harness.rateCurrent(3);

    expect(api.rateLearning).toHaveBeenCalledOnce();
    expect(api.rateLearning.mock.calls[0][6]).toBeUndefined();
    expect(api.recordQuizAttempt).not.toHaveBeenCalled();
    expect(harness.playAnswerSound).toHaveBeenCalledWith(true);
  });

  it('starts and restores a real scene queue with its source IDs, scene example, and checkpoint scene id', async () => {
    const words = realSceneCatalog();
    const snapshot = makeSnapshot(words);
    snapshot.preferences.exerciseType = 'sentence-cloze';
    const values = new Map<string, string>();
    const store = createStudyCheckpointStore({
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    });
    const api = createApi(snapshot);
    const harness = loadWorkspace(api, 1, {
      read: store.read,
      write: store.write,
      resolve: resolveStudyCheckpoint,
    });
    harness.snapshot.value = snapshot;
    harness.catalogWords.value = words;
    harness.loading.value = false;
    const scene = learningScenes.find(item => item.id === 'shopping')!;
    const queue = sceneStudyQueue(scene.id, words, snapshot);

    expect(queue).toHaveLength(8);
    await harness.startSession(queue, 'difficult', undefined, scene.id);

    expect(harness.queue.value.map((item: any) => item.word.id)).toEqual(queue.map(item => item.word.id));
    expect(vueToRaw(harness.queue.value[0].word)).toBe(queue[0].word);
    expect(harness.sessionMode.value).toBe('difficult');
    expect(harness.clozeQuestion.value).toMatchObject({
      ja: sceneExampleFor(scene.id, queue[0].word)?.ja,
      answer: sceneExampleFor(scene.id, queue[0].word)?.cloze.answer,
    });
    harness.revealCloze();
    await harness.rateCurrent(3);
    expect(api.rateLearning.mock.calls[0][7]).toBe(scene.id);
    const saved = store.read(snapshot.identity.partitionKey)!;
    expect(saved.sceneId).toBe(scene.id);
    expect(saved.wordIds).toEqual(queue.slice(1).map(item => item.word.id));

    await harness.resumeCheckpoint();

    expect(harness.sessionSceneId.value).toBe(scene.id);
    expect(harness.queue.value.map((item: any) => item.word.id)).toEqual(saved.wordIds);
    expect(harness.clozeQuestion.value?.ja).toBe(sceneExampleFor(scene.id, harness.queue.value[0].word)?.ja);
  });

  it('refreshes a stale rating and removes the card when it no longer matches the session mode', async () => {
    const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
    const snapshot = makeSnapshot(words);
    const refreshed = makeSnapshot(words, [makeState(words[0], 1), makeState(words[1], 0)]);
    const api = createApi(snapshot);
    api.rateLearning.mockRejectedValueOnce(new Error('这张复习卡已更新，请刷新当前卡片后再评分。'));
    api.read.mockResolvedValue(refreshed);
    const harness = loadWorkspace(api);
    prepareCard(harness, words);

    await harness.rateCurrent(3);
    expect(harness.staleReview.value).toBe(true);
    expect(harness.pendingGrade.value).toBeNull();
    expect(api.rateLearning).toHaveBeenCalledTimes(1);

    await harness.refreshCurrentCard();

    expect(api.read).toHaveBeenCalledTimes(1);
    expect(harness.staleReview.value).toBe(false);
    expect(harness.gradeError.value).toBe('');
    expect(harness.queue.value.map((item: any) => item.word.id)).toEqual(['word-b']);
    expect(harness.index.value).toBe(0);
    expect(harness.queue.value[harness.index.value].word.id).toBe('word-b');
    expect(harness.revealed.value).toBe(false);
  });

  it('refreshes a still-eligible card with fresh state and a new grading request', async () => {
    const word = makeWord('word-a', 1);
    const snapshot = makeSnapshot([word]);
    const refreshed = makeSnapshot([word], [makeState(word, 0)]);
    const api = createApi(snapshot);
    api.rateLearning.mockRejectedValueOnce(new Error('这张复习卡已更新，请刷新当前卡片后再评分。'));
    api.read.mockResolvedValue(refreshed);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);

    await harness.rateCurrent(3);
    const staleRequestId = api.rateLearning.mock.calls[0][2];
    await harness.refreshCurrentCard();

    expect(harness.queue.value).toHaveLength(1);
    expect(harness.queue.value[0].state.reviewCount).toBe(0);
    expect(harness.staleReview.value).toBe(false);
    expect(harness.pendingGrade.value).toBeNull();
    expect(harness.pendingGradeRequestId.value).toBe('');
    expect(harness.revealed.value).toBe(false);

    harness.revealed.value = true;
    await harness.rateCurrent(3);
    expect(api.rateLearning).toHaveBeenCalledTimes(2);
    expect(api.rateLearning.mock.calls[1][2]).not.toBe(staleRequestId);
  });

  it('discards a late old-account rating response after an account switch', async () => {
    const word = makeWord('word-a', 1);
    const oldSnapshot = makeSnapshot([word]);
    const newWord = { ...makeWord('word-b', 1), term: '新しい' };
    const newSnapshot = makeSnapshot([newWord]);
    const api = createApi(newSnapshot);
    const pending = deferred<any>();
    api.rateLearning.mockReturnValueOnce(pending.promise);
    const harness = loadWorkspace(api);
    prepareCard(harness, [word]);

    const write = harness.rateCurrent(3);
    harness.accountChanged();
    pending.resolve(oldSnapshot);
    await write;
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.snapshot.value).toMatchObject({ identity: newSnapshot.identity });
    expect(harness.queue.value).toEqual([]);
    expect(harness.index.value).toBe(0);
    expect(harness.sessionResults.value).toEqual([]);
    expect(harness.pendingGrade.value).toBeNull();
  });

  it('refreshes a same-account sync snapshot without clearing the active queue or grade lock', async () => {
    const word = makeWord('word-a', 1);
    const initial = makeSnapshot([word]);
    const api = createApi(initial);
    const harness = loadWorkspace(api);
    harness.accountChanged({ detail: { partitionKey: 'guest:default' } } as any);
    for (let turn = 0; turn < 6; turn++) await Promise.resolve();

    prepareCard(harness, [word]);
    harness.page.value = 'study';
    harness.pendingGrade.value = 3;
    harness.pendingGradeRequestId.value = 'locked-rating-request';
    harness.pendingGradeExpectedCount.value = 0;
    harness.pendingGradeElapsedMs.value = 1200;
    const synced = makeSnapshot([word], [makeState(word, 2)]);
    api.read.mockResolvedValue(synced);

    harness.accountChanged({ detail: { partitionKey: 'guest:default', refresh: true } } as any);
    for (let turn = 0; turn < 6; turn++) await Promise.resolve();

    expect(api.read).toHaveBeenCalledTimes(2);
    expect(harness.snapshot.value.learning.states[0].reviewCount).toBe(2);
    expect(harness.queue.value).toHaveLength(1);
    expect(harness.queue.value[0].state.reviewCount).toBe(0);
    expect(harness.pendingGrade.value).toBe(3);
    expect(harness.pendingGradeRequestId.value).toBe('locked-rating-request');
    expect(harness.pendingGradeExpectedCount.value).toBe(0);
    expect(harness.pendingGradeElapsedMs.value).toBe(1200);
    expect(harness.page.value).toBe('study');
  });

  it('undoes ignore in place without duplicating a card or rewinding a later answer', async () => {
    const words = [makeWord('word-a', 1), makeWord('word-b', 2), makeWord('word-c', 3)];
    const snapshot = makeSnapshot(words);
    const api = createApi(snapshot);
    const harness = loadWorkspace(api);
    prepareCard(harness, words);

    await harness.ignoreCurrent();
    expect(harness.index.value).toBe(1);
    expect(harness.queue.value).toHaveLength(3);
    await harness.undoIgnore();
    expect(harness.index.value).toBe(0);
    expect(harness.queue.value).toHaveLength(3);
    expect(harness.queue.value.filter((item: any) => item.word.id === 'word-a')).toHaveLength(1);

    await harness.ignoreCurrent();
    harness.revealed.value = true;
    await harness.rateCurrent(3);
    expect(harness.index.value).toBe(2);
    await harness.undoIgnore();
    expect(harness.index.value).toBe(2);
    expect(harness.page.value).toBe('study');
    expect(harness.actionMessage.value).toContain('可在下一轮学习');
    expect(harness.queue.value).toHaveLength(3);
  });
});


describe('extension read-only previous word', () => {
  it('keeps the current question and queue while blocking every learning write during history', async () => {
    const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
    const api = createApi(makeSnapshot(words)); const h = loadWorkspace(api); prepareCard(h, words);
    await h.rateCurrent(3);
    const question = { type: 'kana-meaning', prompt: 'まいにち', options: ['每天', '词语'], correct: '每天' };
    h.activeQuestion.value = question;
    const state = JSON.stringify({ question: h.activeQuestion.value, revealed: h.revealed.value, results: h.sessionResults.value, queue: h.queue.value, snapshot: h.snapshot.value });
    h.previousWord();
    expect(h.reviewWord.value.id).toBe('word-a'); expect(h.index.value).toBe(1);
    await h.rateCurrent(4); await h.ignoreCurrent(); await h.saveQuizAttempt(); h.chooseAnswer('每天');
    expect(api.rateLearning).toHaveBeenCalledOnce(); expect(api.setLearningFlags).not.toHaveBeenCalled(); expect(api.recordQuizAttempt).not.toHaveBeenCalled();
    h.returnToCurrent();
    expect(h.reviewIndex.value).toBeNull();
    expect(JSON.stringify({ question: h.activeQuestion.value, revealed: h.revealed.value, results: h.sessionResults.value, queue: h.queue.value, snapshot: h.snapshot.value })).toBe(state);
  });
  it('does not add failed ratings to history and excludes history time from the next rating', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
      const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
      const api = createApi(makeSnapshot(words)); const h = loadWorkspace(api); prepareCard(h, words); h.resetCard(); h.revealed.value = true;
      api.rateLearning.mockRejectedValueOnce(new Error('offline'));
      await h.rateCurrent(3); expect(h.historyWords.value).toHaveLength(0);
      await h.rateCurrent(3); expect(h.historyWords.value).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200); h.previousWord();
      await vi.advanceTimersByTimeAsync(4000); h.returnToCurrent();
      await vi.advanceTimersByTimeAsync(300); h.revealed.value = true; await h.rateCurrent(3);
      expect(api.rateLearning.mock.calls.at(-1)?.[5]).toBe(500);
    } finally { vi.useRealTimers(); }
  });
  it('preserves an explicit all-book scope while a fresh guest defaults to the current book', async () => {
    const first = makeWord('word-a', 1); const second = { ...makeWord('word-b', 2), lessonId: 'jlpt-n5-l-1', bookTitle: 'JLPT N5 备考词汇' };
    const snapshot = makeSnapshot([first, second]); const h = loadWorkspace(createApi(snapshot));
    h.snapshot.value = snapshot; h.catalogWords.value = [first, second];
    expect(h.selectedBookIds.value).toEqual(['biaori-beginner-upper']);
    h.snapshot.value.preferences.selectedBookIdsExplicit = true;
    expect(h.selectedBookIds.value).toEqual(['biaori-beginner-upper', 'jlpt-n5']);
  });
});

describe('extension cached learning navigation', () => {
  async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
  function browserStub() {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  }
  it('preserves the current round and reveal while stopping audio and hidden keyboard handling', async () => {
    vi.useFakeTimers(); browserStub();
    try {
      const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
      const api = createApi(makeSnapshot(words)); const h = loadWorkspace(api);
      prepareCard(h, words); h.page.value = 'study'; h.index.value = 1;
      h.deactivate();
      const preventDefault = vi.fn();
      h.keydown({ code: 'Space', key: ' ', preventDefault, target: { closest: () => null } });
      expect(preventDefault).not.toHaveBeenCalled(); expect(h.stop).toHaveBeenCalled();
      h.activate(); await flush();
      expect(h.index.value).toBe(1); expect(h.page.value).toBe('study');
      expect(h.revealed.value).toBe(true); expect(h.queue.value).toHaveLength(2);
      expect(h.loading.value).toBe(false); h.deactivate();
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('clears a cached round on account change and reads the new account only when reopened', async () => {
    vi.useFakeTimers(); browserStub();
    try {
      const word = makeWord('word-a', 1); const fresh = makeSnapshot([word]);
      fresh.identity.partitionKey = 'account:new'; const api = createApi(fresh); const h = loadWorkspace(api);
      prepareCard(h, [word]); h.page.value = 'study'; h.deactivate();
      h.accountChanged({ detail: { partitionKey: 'account:new' } });
      expect(h.snapshot.value).toBeNull(); expect(h.queue.value).toEqual([]);
      expect(api.read).not.toHaveBeenCalled();
      h.activate(); await flush();
      expect(h.snapshot.value.identity.partitionKey).toBe('account:new');
      expect(h.page.value).toBe('home'); h.deactivate();
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('does not replace a newer snapshot with a delayed rating reply after returning to learning', async () => {
    vi.useFakeTimers(); browserStub();
    try {
      const words = [makeWord('word-a', 1), makeWord('word-b', 2)];
      const old = makeSnapshot(words); const fresh = makeSnapshot(words); fresh.preferences.dailyGoal = 35;
      const api = createApi(fresh); const pending = deferred<any>();
      api.rateLearning.mockReturnValueOnce(pending.promise); const h = loadWorkspace(api);
      prepareCard(h, words); h.page.value = 'study';
      const rating = h.rateCurrent(3); h.deactivate(); h.activate(); await flush();
      expect(h.snapshot.value.preferences.dailyGoal).toBe(35);
      pending.resolve(old); await rating; await flush();
      expect(h.snapshot.value.preferences.dailyGoal).toBe(35);
      expect(h.index.value).toBe(1); expect(h.sessionResults.value).toHaveLength(1); h.deactivate();
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});

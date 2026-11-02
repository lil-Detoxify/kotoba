import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { computed, effectScope, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuestion, evaluate, initialState, quizAttempt, quizRating, stateFor, progress } from '@jp/core';
import type { Data, Word } from '@jp/models';
import { useStudyHistory } from '../apps/web/src/composables/useStudyHistory';
import { createSentenceCloze, matchesClozeExample } from '../apps/web/src/services/sentence-cloze';
import { sessionSummary } from '../apps/web/src/services/study-feedback';
import { sceneFor, sceneExampleFor } from '../apps/web/src/services/learning-scenes';
import { meaningPresentation } from '../apps/web/src/services/meaning-presentation';
import { createInputQuestion, inputAttempt } from '../apps/web/src/services/kana-input';
import { dailyStudyPlan } from '../apps/web/src/services/daily-study-plan';
import { useStudyPlanPreference } from '../apps/web/src/services/study-plan-preference';
import { completionNextAction } from '../apps/web/src/services/completion-next-action';
import { personalExampleFor, personalClozeExampleFor } from '../apps/web/src/services/personal-learning-example';
import {lessonPracticeRecommendation} from '../apps/web/src/services/lesson-practice-recommendation';

const words: Word[] = [
  { id: 'a', lessonId: 'lesson', term: '本', reading: 'ほん', meaning: '书', order: 1 },
  { id: 'b', lessonId: 'lesson', term: '机', reading: 'つくえ', meaning: '桌子', order: 2 },
  { id: 'c', lessonId: 'lesson', term: '椅子', reading: 'いす', meaning: '椅子', order: 3 },
  { id: 'd', lessonId: 'lesson', term: '新聞', reading: 'しんぶん', meaning: '报纸', order: 4 },
];
const scopes: ReturnType<typeof effectScope>[] = [];

/** Execute the real page's setup, using the same SFC harness approach as the other clients. */
function loadStudy(options: { autoplay?: boolean; mode?: 'new' | 'review'; exercise?: string } = {}) {
  const path = resolve('apps/web/src/pages/Study.vue');
  const descriptor = parse(readFileSync(path, 'utf8'), { filename: path }).descriptor;
  const script = compileScript(descriptor, { id: 'web-study-history-test' });
  const match = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!match) throw new Error('Unable to extract Study.vue setup');
  let code = ts.transpileModule(match[1], { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  code = code.replace(/__expose\(\);\s*/, '');
  code += '\nreturn { answer, started, answeredIn, heard, uncertain, exercise, question, attempt, clozeQuestion, clozeValue, clozeMatches, revealCloze, inputQuestion, inputValue, submitInput, word, currentWord, history, reviewing, canPrevious, busy, invalidated, actionError, rate, next, choose, previous, resume, ignore, difficult, play, key, autoplayEnabled, pageVisible, handleVisibilityChange, completionAction, continueAfterCompletion };';
  const data: Data = { books: [], lessons: [], words: structuredClone(words), states: [], logs: [], seeded: true };
  const app = reactive({ data, queue: structuredClone(words), index: 0, sessionSize: 4, mode: options.mode ?? 'new', sessionExercise: options.exercise ?? 'card', currentUser: null as { id: string } | null, busy: false, error: '',
    stats: {due:0}, start: vi.fn(async () => true), startDailyLearning: vi.fn(async () => true), startFocusedPractice: vi.fn(async () => true),
    rate: vi.fn(async (rating: any, responseTime: number, attempt?: any) => {
      const word = app.queue[app.index];
      const previous = stateFor(app.data, word.id, 'local') ?? initialState(word.id, new Date(), 'local');
      const result = evaluate(previous, rating, app.mode, new Date(), 'log-'+app.index, responseTime);
      if (attempt) result.log.quiz = { ...attempt, options: [...attempt.options] };
      app.data.states = app.data.states.filter(state => state.wordId !== word.id);
      app.data.states.push(result.state);
      app.data.logs.push(result.log);
      app.index++;
    }),
    flag: vi.fn(async (id: string, flag: string, value: boolean) => {
      const state = stateFor(app.data, id, 'local') ?? initialState(id, new Date(), 'local');
      (state as any)[flag] = value;
      app.data.states = [...app.data.states.filter(item => item.wordId !== id), state];
      return true;
    }),
  });
  const pronunciation = { voiceModel: ref('female'), hasJapaneseVoice: ref(false), error: ref(''), available: () => true,
    play: vi.fn(async () => true), stop: vi.fn(), setVoice: vi.fn(), speaking: ref(false) };
  const router = { push: vi.fn(async () => {}) };
  const dependencies = {
    computed, ref, shallowRef, watch, nextTick, onMounted: () => {}, onUnmounted: () => {},
    useApp: () => app, usePronunciation: () => pronunciation, useStudyHistory,
    useWordAutoplayPreference: () => ({ enabled: ref(options.autoplay ?? false) }),
    useRouter: () => router, dailyStudyPlan, useStudyPlanPreference, completionNextAction,lessonPracticeRecommendation,
    stateFor, progress, createQuestion, quizAttempt, quizRating, notifyPet: vi.fn(),
    createSentenceCloze, matchesClozeExample, sessionSummary,
    sceneFor, sceneExampleFor, meaningPresentation, createInputQuestion, inputAttempt,personalExampleFor,personalClozeExampleFor,
    playAnswerSound: vi.fn(async () => true), stopAnswerSound: vi.fn(),
    pet: { settings: { enabled: false } }, gsap: {},
  };
  const scope = effectScope();
  scopes.push(scope);
  const page = scope.run(() => new Function(...Object.keys(dependencies), code)(...Object.values(dependencies))) as Record<string, any>;
  return { app, pronunciation, page, router };
}

function key(page: Record<string, any>, value: string, editing = false) {
  const event = { key: value, target: { closest: () => editing ? {} : null }, preventDefault: vi.fn() };
  page.key(event);
  return event;
}

async function rateOne(page: Record<string, any>) {
  page.answer.value = true;
  await page.rate(3);
  await nextTick();
}

describe('Web previous-word history and actual study page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T06:00:00Z'));
    vi.stubGlobal('window', { scrollTo: vi.fn(), matchMedia: () => ({ matches: true }) });
  });
  afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); vi.useRealTimers(); });

  async function flushAutoplay() { await nextTick();await vi.advanceTimersByTimeAsync(800);for(let index=0;index<3;index++)await nextTick(); }

  it('keeps the first wrong input result for scoring and recommends its focused practice after completion', async () => {
    const { app, page }=loadStudy({exercise:'kana-input'});
    page.submitInput('ほ');
    const first=page.attempt.value;
    page.submitInput('ほん');
    expect(page.attempt.value).toBe(first);
    await page.next();await nextTick();
    expect(app.data.logs[0].quiz?.selected).toBe('ほ');
    expect(app.data.logs[0].quiz?.isCorrect).toBe(false);
    for(let i=0;i<3;i++){page.submitInput(page.inputQuestion.value.correct);await page.next();await nextTick()}
    expect(page.completionAction.value.action).toBe('practice');
    await page.continueAfterCompletion();
    expect(app.startFocusedPractice).toHaveBeenCalledWith(['a'],'kana-input',undefined);
    expect(app.data.logs).toHaveLength(4);
  });

  it('offers remaining due reviews and prevents duplicate completion starts', async () => {
    const { app, page }=loadStudy();
    app.index=4;app.stats.due=2;await nextTick();
    expect(page.completionAction.value.action).toBe('review');
    let release!:()=>void;
    app.start.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve});return true});
    const pending=page.continueAfterCompletion();
    await page.continueAfterCompletion();
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(app.start).toHaveBeenCalledWith('review');
    release();await pending;
  });

  it('returns home when the round is done and no further task remains', async () => {
    const {app,page,router}=loadStudy();
    app.index=4;await nextTick();
    expect(page.completionAction.value.action).toBe('finish');
    await page.continueAfterCompletion();
    expect(router.push).toHaveBeenCalledWith('/');
    expect(app.start).not.toHaveBeenCalled();
  });

  it.each(['new', 'review'] as const)('automatically pronounces the first and next %s word without replaying reveals or history', async mode => {
    const { page, pronunciation } = loadStudy({ autoplay: true, mode });
    await flushAutoplay();
    expect(pronunciation.play.mock.calls.map(call => call[0].id)).toEqual(['a']);
    page.answer.value = true; await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
    await rateOne(page); await flushAutoplay();
    expect(pronunciation.play.mock.calls.map(call => call[0].id)).toEqual(['a', 'b']);
    page.previous(); await flushAutoplay(); page.resume(); await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(2);
  });

  it('keeps manual pronunciation available when autoplay is disabled', async () => {
    const { page, pronunciation } = loadStudy();
    await flushAutoplay();
    expect(pronunciation.play).not.toHaveBeenCalled();
    await page.play();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
    page.autoplayEnabled.value = true; await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
  });

  it.each(['audio-meaning', 'dictation'])('automatically unlocks heard gating for %s after playback starts', async exercise => {
    const { page, pronunciation } = loadStudy({ autoplay: true, exercise });
    await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
    expect(page.heard.value).toBe(true);
    if(exercise === 'dictation')page.submitInput(page.inputQuestion.value.correct);
    else page.choose(page.question.value.correct);
    expect(page.attempt.value?.isCorrect).toBe(true);
    await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
  });

  it.each(['kanji-reading', 'kana-input'])('waits for the revealed answer before pronouncing %s', async exercise => {
    const { page, pronunciation } = loadStudy({ autoplay: true, exercise });
    await flushAutoplay();
    expect(pronunciation.play).not.toHaveBeenCalled();
    if(exercise === 'kana-input')page.submitInput(page.inputQuestion.value.correct);
    else page.choose(page.question.value.correct);
    await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
  });

  it('waits for a cloze reveal and does not repeat the word after another reveal', async () => {
    const { page, app, pronunciation } = loadStudy();
    app.queue[0].term='会う';app.queue[0].reading='あう';
    page.exercise.value='sentence-cloze';page.autoplayEnabled.value=true;
    await flushAutoplay();
    expect(page.clozeQuestion.value).not.toBeNull();
    expect(pronunciation.play).not.toHaveBeenCalled();
    page.revealCloze(); await flushAutoplay(); page.revealCloze(); await flushAutoplay();
    expect(pronunciation.play).toHaveBeenCalledTimes(1);
  });

  it('cancels a queued word on rapid navigation, hiding, disabling or an account change', async () => {
    const { page, app, pronunciation } = loadStudy({ autoplay: true });
    app.index=1;app.index=2;
    await flushAutoplay();
    expect(pronunciation.play.mock.calls.map(call => call[0].id)).toEqual(['c']);
    pronunciation.play.mockClear();
    app.index=3;page.autoplayEnabled.value=false;
    await flushAutoplay();
    expect(pronunciation.play).not.toHaveBeenCalled();
    page.autoplayEnabled.value=true;page.pageVisible.value=false;
    await flushAutoplay();
    expect(pronunciation.play).not.toHaveBeenCalled();
    app.currentUser={id:'another-account'};page.pageVisible.value=true;
    await flushAutoplay();
    expect(pronunciation.play).not.toHaveBeenCalled();
  });

  it('reveals a filled example without writing a grade until the learner evaluates it', async () => {
    const { app, page }=loadStudy();
    app.queue[0].term='会う';app.queue[0].reading='あう';
    page.exercise.value='sentence-cloze';await nextTick();
    expect(page.clozeQuestion.value.answer).toBe('会います');
    page.clozeValue.value='あいます';page.revealCloze();
    expect(page.clozeMatches.value).toBe(true);
    expect(app.rate).not.toHaveBeenCalled();
    await page.rate(2);await nextTick();
    expect(app.data.logs).toHaveLength(1);
    expect(app.data.logs[0].rating).toBe(2);
    expect(app.data.logs[0].quiz).toBeUndefined();
    await page.rate(3);
    expect(app.data.logs).toHaveLength(1);
  });

  it('disables the first-word history, and repeated viewing never rates or changes FSRS state', async () => {
    const { app, page } = loadStudy();
    expect(page.canPrevious.value).toBe(false);
    page.previous();
    expect(page.reviewing.value).toBe(false);
    await rateOne(page);
    const persisted = JSON.stringify(app.data);
    page.previous();
    expect(page.word.value.id).toBe('a');
    expect(page.currentWord.value.id).toBe('b');
    expect(page.canPrevious.value).toBe(false);
    await page.rate(1); await page.next(); await page.ignore();
    key(page, '1'); key(page, 'i');
    expect(app.rate).toHaveBeenCalledTimes(1);
    expect(app.index).toBe(1);
    expect(JSON.stringify(app.data)).toBe(persisted);
    page.resume();
    expect(page.word.value.id).toBe('b');
  });

  it('keeps quiz options, selected answer and uncertainty, with exactly one saved answer after return', async () => {
    const { app, page } = loadStudy();
    await rateOne(page);
    page.exercise.value = 'kana-meaning'; await nextTick();
    const question = page.question.value;
    page.choose(question.correct);
    page.uncertain.value = true;
    const attempt = page.attempt.value;
    page.previous(); await nextTick(); page.resume(); await nextTick();
    expect(page.question.value).toBe(question);
    expect(page.attempt.value).toBe(attempt);
    expect(page.uncertain.value).toBe(true);
    await page.next(); await nextTick();
    expect(app.data.logs).toHaveLength(2);
    expect(app.data.logs[1].rating).toBe(2);
    expect(app.data.logs[1].quiz?.selected).toBe(question.correct);
  });

  it('preserves the current card reveal and excludes all consecutive review time from response time', async () => {
    const { app, page } = loadStudy();
    await rateOne(page); await rateOne(page);
    page.answer.value = true;
    vi.advanceTimersByTime(1000);
    page.previous(); vi.advanceTimersByTime(5000); page.previous(); vi.advanceTimersByTime(7000);
    page.resume();
    expect(page.answer.value).toBe(true);
    expect(page.word.value.id).toBe('c');
    vi.advanceTimersByTime(2000);
    await page.rate(3);
    expect(app.data.logs[2].responseTime).toBe(3000);
  });

  it('restores an unanswered listening question without accepting a previous word audio as heard', async () => {
    const { page, pronunciation } = loadStudy();
    await rateOne(page);
    page.exercise.value = 'audio-meaning'; await nextTick();
    const question = page.question.value;
    expect(page.heard.value).toBe(false);
    page.previous(); await page.play(); page.resume(); await nextTick();
    expect(page.question.value).toBe(question);
    expect(page.heard.value).toBe(false);
    page.choose(question.correct);
    expect(page.attempt.value).toBeNull();
    await page.play();
    expect(page.heard.value).toBe(true);
    expect(pronunciation.stop).toHaveBeenCalled();
  });

  it('supports last-word and completed-session review without extra completion writes', async () => {
    const { app, page } = loadStudy();
    for (let i = 0; i < 4; i++) await rateOne(page);
    expect(page.word.value).toBeUndefined();
    page.previous();
    expect(page.word.value.id).toBe('d');
    expect(page.currentWord.value).toBeUndefined();
    page.resume();
    expect(page.word.value).toBeUndefined();
    expect(app.data.logs).toHaveLength(4);
    expect(app.index).toBe(4);
  });

  it('records only successful ignore or rating advances; failed saves retain the card and answer', async () => {
    const { app, page } = loadStudy();
    app.rate.mockImplementationOnce(async () => { app.error = '保存失败'; });
    await rateOne(page);
    expect(page.answer.value).toBe(true);
    expect(page.word.value.id).toBe('a');
    expect(page.canPrevious.value).toBe(false);
    app.rate.mockImplementationOnce(async () => { throw new Error('同步队列写入失败'); });
    await page.rate(3);
    expect(page.actionError.value).toBe('同步队列写入失败');
    expect(page.canPrevious.value).toBe(false);
    await page.ignore(); await nextTick();
    page.previous();
    expect(page.word.value.id).toBe('a');
    expect(app.data.logs).toHaveLength(0);
    expect(stateFor(app.data, 'a', 'local')?.isIgnored).toBe(true);
  });

  it('blocks history and duplicate submissions while saving, and clears it on a new queue', async () => {
    const { app, page } = loadStudy();
    await rateOne(page);
    let release!: () => void;
    app.rate.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); app.index++; });
    page.answer.value = true;
    const pending = page.rate(3);
    expect(page.busy.value).toBe(true);
    page.previous(); await page.rate(3);
    expect(page.reviewing.value).toBe(false);
    app.queue = [words[3]]; app.index = 0;
    release(); await pending; await nextTick();
    expect(page.history.entries.value).toHaveLength(0);
    expect(page.canPrevious.value).toBe(false);
    expect(app.rate).toHaveBeenCalledTimes(2);
  });

  it('invalidates old-account words immediately, and new sessions start with no history', async () => {
    const { app, page } = loadStudy();
    await rateOne(page); page.previous();
    app.currentUser = { id: 'another-account' };
    expect(page.invalidated.value).toBe(true);
    expect(page.word.value).toBeUndefined();
    expect(page.history.entries.value).toHaveLength(0);
    await page.rate(3);
    app.queue = [words[2]]; app.index = 0; await nextTick();
    expect(page.invalidated.value).toBe(false);
    expect(page.word.value.id).toBe('c');
    expect(page.canPrevious.value).toBe(false);
  });

  it('supports arrow and Space navigation while leaving editable controls alone', async () => {
    const { page } = loadStudy();
    await rateOne(page);
    key(page, 'ArrowLeft', true);
    expect(page.reviewing.value).toBe(false);
    expect(key(page, 'ArrowLeft').preventDefault).toHaveBeenCalled();
    expect(page.reviewing.value).toBe(true);
    key(page, 'ArrowRight');
    expect(page.reviewing.value).toBe(false);
    key(page, 'ArrowLeft'); key(page, ' ');
    expect(page.reviewing.value).toBe(false);
  });
});

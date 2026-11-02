import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { parse as parseDOM } from '@vue/compiler-dom';
import ts from 'typescript';
import { computed as vueComputed, effectScope, reactive, ref as vueRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { progress, stateFor } from '@jp/core';
import { useHomeDisplayPreference } from '../apps/web/src/services/home-display-preference';
import { useStudyPlanPreference } from '../apps/web/src/services/study-plan-preference';
import { dailyStudyPlan } from '../apps/web/src/services/daily-study-plan';
import { bookCategory, fullBookTitle } from '../apps/web/src/services/book-presentation';
import { sceneFor } from '../apps/web/src/services/learning-scenes';
import { shouldShowLearningStart, useLearningStartPreference } from '../apps/web/src/services/learning-start';

const homePath = resolve(process.cwd(), 'apps/web/src/pages/Home.vue');

function loadHome(app: Record<string, any>) {
  const descriptor = parse(readFileSync(homePath, 'utf8'), { filename: homePath }).descriptor;
  const script = compileScript(descriptor, { id: 'web-home-resume-ui-test' });
  const setupMatch = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!setupMatch) throw new Error('Unable to extract Home.vue setup body');
  const sourceFile = ts.createSourceFile('home-setup.ts', setupMatch[1], ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const setup = ts.transpileModule(sourceFile.text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/__expose\(\);\s*/, '');
  const router = { push: vi.fn(async () => undefined) };
  const dependencies: Record<string, unknown> = { useApp: () => app, useRouter: () => router, progress, stateFor, useHomeDisplayPreference, useStudyPlanPreference, dailyStudyPlan, bookCategory, fullBookTitle, sceneFor, shouldShowLearningStart, useLearningStartPreference };
  const names = Object.keys(dependencies);
  const code = `${setup}\nreturn { startLearning, review, starting, actionError, hasProgress, bp, book, currentBookCoverContent, actionMode, primaryLabel, resumeBookTitle, scopeLabel, roundPosition, idlePlanMessage, todayPlan };`;
  const scope = effectScope();
  const page = scope.run(() => new Function(...names, 'computed', 'ref', code)(
    ...names.map(name => dependencies[name]), vueComputed, vueRef,
  )) as Record<string, any>;
  return { page, router, scope, descriptor };
}

function makeApp(overrides: Record<string, any> = {}) {
  return reactive({
    data: { books: [], lessons: [], words: [], states: [], logs: [], currentBookId: '' }, queue: [], index: 0, studySession: null,
    metaBooks: [], stats: null, busy: false, hasResumableSession: false, error: '',
    start: vi.fn(async () => undefined), startDailyLearning: vi.fn(async () => false), continueLearning: vi.fn(async () => true),
    ...overrides,
  });
}

function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 1 ? [node] : [];
  return own.concat(...(node.children ?? []).map(elements));
}

function directive(element: any, name: string, arg: string) {
  return element.props.find((prop: any) => prop.type === 7 && prop.name === name && prop.arg?.content === arg);
}

function attribute(element: any, name: string) {
  return element.props.find((prop: any) => prop.type === 6 && prop.name === name)?.value?.content;
}

describe('Web home resume CTA and book selection', () => {
  it('starts the current book daily plan when there is no unfinished session', async () => {
    const app = makeApp({
      data: { books: [{ id: 'book-a', title: '词书 A', description: '', language: 'ja', createdAt: '', updatedAt: '' }], lessons: [{ id: 'lesson-a', bookId: 'book-a', title: '第1课', order: 1 }], words: [{ id: 'word-a', lessonId: 'lesson-a', term: '駅', reading: 'えき', meaning: '车站', order: 1 }], states: [], logs: [], currentBookId: 'book-a' },
      startDailyLearning: vi.fn(async () => true),
    });
    const { page, router, scope } = loadHome(app);
    try {
      await page.startLearning();
      expect(app.startDailyLearning).toHaveBeenCalledOnce();
      expect(app.startDailyLearning).toHaveBeenCalledWith('book-a');
      expect(app.continueLearning).not.toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith('/study');
    } finally { scope.stop(); }
  });
  it('gives an unfinished session priority and continues its original queue', async () => {
    const app = makeApp({ hasResumableSession: true, studySession: { bookIds: ['original-book'], lessonIds: ['lesson-2'], wordIds: ['a', 'b', 'c'], index: 1 }, data: {
      books: [{ id: 'original-book', title: '原词书', description: '', language: 'ja', createdAt: '', updatedAt: '' }], currentBookId: 'other-book',
      lessons: [{ id: 'lesson-2', bookId: 'original-book', title: '第二课', order: 2 }], words: [], states: [], logs: [],
    } });
    const { page, router, scope } = loadHome(app);
    try {
      expect(page.actionMode.value).toBe('resume');
      expect(page.primaryLabel.value).toBe('继续上次学习');
      expect(page.resumeBookTitle.value).toBe('原词书');
      expect(page.scopeLabel.value).toBe('第二课');
      expect(page.roundPosition.value).toEqual({done:1,size:3});
      await page.startLearning();
      expect(app.continueLearning).toHaveBeenCalledOnce();
      expect(app.startDailyLearning).not.toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledOnce();
      expect(router.push).toHaveBeenCalledWith('/study');
    } finally { scope.stop(); }
  });

  it('stays on the home page when continuation fails', async () => {
    const app = makeApp({ hasResumableSession: true, studySession: { bookIds: ['book-a'], lessonIds: ['lesson-a'], wordIds: ['word-a'], index: 0 }, continueLearning: vi.fn(async () => false) });
    const { page, router, scope } = loadHome(app);
    try {
      await page.startLearning();
      expect(app.continueLearning).toHaveBeenCalledOnce();
      expect(router.push).not.toHaveBeenCalled();
      expect(page.starting.value).toBe(false);
    } finally { scope.stop(); }
  });

  it('guards busy and in-flight starts against duplicate calls', async () => {
    const app = makeApp({ busy: true, hasResumableSession: true, studySession: { bookIds: ['book-a'], lessonIds: ['lesson-a'], wordIds: ['word-a'], index: 0 } });
    const first = loadHome(app);
    try {
      await first.page.startLearning();
      expect(app.continueLearning).not.toHaveBeenCalled();
    } finally { first.scope.stop(); }

    app.busy = false; app.hasResumableSession = true;
    let resolveContinue!: (success: boolean) => void;
    app.continueLearning = vi.fn(() => new Promise<boolean>(resolve => { resolveContinue = resolve; }));
    const { page, router, scope } = loadHome(app);
    try {
      const pending = page.startLearning();
      expect(page.starting.value).toBe(true);
      await page.startLearning();
      expect(app.continueLearning).toHaveBeenCalledOnce();
      expect(router.push).not.toHaveBeenCalled();
      resolveContinue(true);
      await pending;
      expect(router.push).toHaveBeenCalledOnce();
      expect(router.push).toHaveBeenCalledWith('/study');
      expect(page.starting.value).toBe(false);
    } finally { scope.stop(); }
  });

  it('keeps the separate book picker linked to the book list and reuses its cover component', () => {
    const descriptor = parse(readFileSync(homePath, 'utf8'), { filename: homePath }).descriptor;
    const script = compileScript(descriptor, { id: 'web-home-template-test' });
    const template = compileTemplate({ source: descriptor.template!.content, filename: homePath, id: 'web-home-template-test', compilerOptions: { bindingMetadata: script.bindings } });
    expect(template.errors).toEqual([]);
    const root = parseDOM(descriptor.template!.content);
    const nodes = elements(root);
    const mainCta = nodes.find(node => node.tag === 'button' && attribute(node, 'class') === 'primary');
    expect(mainCta).toBeDefined();
    const invoke = new Function('actionMode', 'review', 'startLearning', `return (${directive(mainCta, 'on', 'click').exp.content});`);
    const review=vi.fn(), start=vi.fn();
    invoke('new',review,start);
    expect(start).toHaveBeenCalledOnce();
    invoke('review',review,start);
    expect(review).toHaveBeenCalledOnce();
    expect(directive(mainCta, 'bind', 'disabled')?.exp?.content).toMatch(/app\.busy\s*\|\|\s*starting/);
    expect(descriptor.template!.content).toContain('{{primaryLabel}}');
    expect(nodes.find(node => node.tag === 'RouterLink' && attribute(node, 'to') === '/books')).toBeDefined();

    const bookLink = nodes.find(node => node.tag === 'RouterLink' && attribute(node, 'class') === 'current-book');
    expect(directive(bookLink, 'bind', 'to')?.exp?.content).toBe("'/books/'+book.id");
    const cover = elements(bookLink).find(node => node.tag === 'BookCover');
    expect(cover).toBeDefined();
    expect(directive(cover, 'bind', 'content')?.exp?.content).toBe('currentBookCoverContent');
    expect(descriptor.template!.content).toContain('打开词书，选择课次');
  });

  it('shows review first on the review display, with an available new-word secondary action', async () => {
    const { setDisplay } = useHomeDisplayPreference();
    setDisplay('review');
    const app = makeApp({ stats: { due: 3 }, data: {
      books: [{ id: 'book-a', title: '词书 A', description: '', language: 'ja', createdAt: '', updatedAt: '' }], currentBookId: 'book-a',
      lessons: [{ id: 'lesson-a', bookId: 'book-a', title: '第1课', order: 1 }], words: [{ id: 'word-a', lessonId: 'lesson-a', term: '駅', reading: 'えき', meaning: '车站', order: 1 }], states: [], logs: [],
    } });
    const { page, scope } = loadHome(app);
    try {
      expect(page.actionMode.value).toBe('review');
      expect(page.primaryLabel.value).toBe('开始复习');
      expect(page.todayPlan.value.remaining).toBe(1);
      await page.startLearning(true);
      expect(app.startDailyLearning).toHaveBeenCalledWith('book-a');
    } finally { scope.stop(); }
  });

  it('starts review with a shared busy guard and reports a failed start inline', async () => {
    const app = makeApp({ stats: { due: 2 }, start: vi.fn(async () => false), error: '复习队列暂不可用。' });
    const { page, router, scope } = loadHome(app);
    try {
      const first = page.review();
      expect(page.starting.value).toBe(true);
      await page.review();
      await first;
      expect(app.start).toHaveBeenCalledOnce();
      expect(router.push).not.toHaveBeenCalled();
      expect(page.actionError.value).toBe('复习队列暂不可用。');
      expect(page.starting.value).toBe(false);
    } finally { scope.stop(); }
  });

  it('offers lesson selection after today\'s plan is exhausted instead of starting an empty queue', () => {
    const { setDisplay } = useHomeDisplayPreference();
    setDisplay('progress');
    const now = new Date();
    const app = makeApp({ now, data: {
      books: [{ id: 'book-a', title: '词书 A', description: '', language: 'ja', createdAt: '', updatedAt: '' }], currentBookId: 'book-a',
      lessons: [{ id: 'lesson-a', bookId: 'book-a', title: '第1课', order: 1 }], words: [{ id: 'word-a', lessonId: 'lesson-a', term: '駅', reading: 'えき', meaning: '车站', order: 1 }],
      states: [{ wordId: 'word-a', lessonId: 'lesson-a', bookId: 'book-a', userId: 'local', status: 'learning', firstSeenAt: now.toISOString(), reviewCount: 1, isIgnored: false }], logs: [],
    } });
    const { page, scope } = loadHome(app);
    try {
      expect(page.todayPlan.value.remaining).toBe(0);
      expect(page.actionMode.value).toBe('none');
      expect(page.primaryLabel.value).toBe('');
      expect(page.idlePlanMessage.value).toContain('今日计划已完成');
    } finally { scope.stop(); }
  });

  it('matches the library cover content and scopes unloaded-book progress to that book', () => {
    const app = makeApp({
      data: {
        books: [{ id: 'book-a', title: '旧书名', description: '', language: 'ja', createdAt: '', updatedAt: '' }],
        currentBookId: 'book-a',
        lessons: [
          { id: 'a-1', bookId: 'book-a', title: '旅行第1课', order: 1 },
          { id: 'a-2', bookId: 'book-a', title: '第2课', order: 2 },
          { id: 'b-1', bookId: 'book-b', title: '文化课', order: 1 },
        ],
        words: [
          { id: 'a-word', lessonId: 'a-1', term: '駅', reading: 'えき', meaning: '旅行车站', order: 1 },
          { id: 'b-word', lessonId: 'b-1', term: '芸術', reading: 'げいじゅつ', meaning: '文化艺术', order: 1 },
        ],
        states: [
          { wordId: 'a-learned', lessonId: 'a-1', bookId: 'book-a', status: 'learning', firstSeenAt: '2026-10-01', reviewCount: 1, isIgnored: false },
          { wordId: 'a-ignored', lessonId: 'a-2', bookId: 'book-a', status: 'learning', firstSeenAt: '2026-10-01', reviewCount: 1, isIgnored: true },
          { wordId: 'b-learned', lessonId: 'b-1', bookId: 'book-b', status: 'mastered', firstSeenAt: '2026-10-01', reviewCount: 4, isIgnored: false },
        ],
        logs: [],
      },
      metaBooks: [{
        id: 'book-a', title: '新书名', description: '', wordCount: 20,
        lessons: [
          { id: 'a-1', bookId: 'book-a', title: '旅行第1课', order: 1, wordCount: 10 },
          { id: 'a-2', bookId: 'book-a', title: '第2课', order: 2, wordCount: 10 },
        ],
      }],
    });
    const { page, scope } = loadHome(app);
    try {
      expect(page.book.value.title).toBe('旧书名');
      expect(page.currentBookCoverContent.value).toBe(' 旅行第1课 第2课 旅行车站');
      expect(page.currentBookCoverContent.value).not.toContain('文化艺术');
      app.data.words = [];
      expect(page.bp.value).toMatchObject({ total: 19, learned: 1, mastered: 0, percent: 5 });
    } finally { scope.stop(); }
  });
});

import { readFileSync } from 'node:fs';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { computed, effectScope, nextTick, reactive, ref, watch } from 'vue';
import { describe, expect, it } from 'vitest';
import { emptyData } from '@jp/models';
import { initialState } from '@jp/core';
import { learningAnalytics, libraryProgress } from '../apps/web/src/services/learning-analytics';
import { weakPracticeSuggestions } from '../apps/web/src/services/study-feedback';

function setupStats() {
  const source = readFileSync('apps/web/src/pages/Stats.vue', 'utf8');
  const script = compileScript(parse(source).descriptor, { id: 'stats-drawers' });
  const match = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!match) throw new Error('Stats.vue setup unavailable');
  const code = ts.transpileModule(match[1], { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace(/__expose\(\);\s*/, '') + '\nreturn { openBooks, toggleBook, range, analytics, currentBookProgress };';
  const app = reactive({ data: { ...emptyData(), currentBookId: 'a' }, currentUser: null as { id: string } | null, now: new Date(), metaBooks: [] });
  const dependencies = { computed, ref, watch, useApp: () => app, useRouter:()=>({push:async()=>{}}), learningAnalytics, libraryProgress, weakPracticeSuggestions };
  const scope = effectScope();
  const page = scope.run(() => new Function(...Object.keys(dependencies), code)(...Object.values(dependencies))) as any;
  return { app, page, scope };
}

describe('Web statistics progressive disclosure', () => {
  it('updates memory stages when the active book or account changes, independently of chart range', async () => {
    const { app, page, scope } = setupStats();
    try {
      app.data.books = ['a', 'b'].map(id => ({ id, title: '词书 ' + id, description: '', language: 'ja', createdAt: '', updatedAt: '' }));
      app.data.lessons = ['a', 'b'].map(id => ({ id: 'lesson-' + id, bookId: id, title: '第1课', order: 1 }));
      app.data.words = ['a', 'b'].map(id => ({ id: 'word-' + id, lessonId: 'lesson-' + id, term: '词', reading: '', meaning: '', order: 1 }));
      app.data.states = [{ ...initialState('word-a', app.now), firstSeenAt: app.now.toISOString(), reviewCount: 1, status: 'learning' }];
      expect(page.currentBookProgress.value).toMatchObject({ id: 'a', total: 1, stages: { new: 0, learning: 1, review: 0, mastered: 0 } });
      page.range.value = 30;
      expect(page.currentBookProgress.value.stages.learning).toBe(1);
      app.data.currentBookId = 'b';
      await nextTick();
      expect(page.currentBookProgress.value).toMatchObject({ id: 'b', total: 1, stages: { new: 1, learning: 0, review: 0, mastered: 0 } });
      app.data.currentBookId = 'a';
      app.currentUser = { id: 'bob' };
      await nextTick();
      expect(page.currentBookProgress.value.stages).toEqual({ new: 1, learning: 0, review: 0, mastered: 0 });
      app.data.currentBookId = 'missing';
      expect(page.currentBookProgress.value).toBeUndefined();
    } finally { scope.stop(); }
  });
  it('opens only the current textbook, while retaining explicitly opened drawers', () => {
    const { page, scope } = setupStats();
    try {
      expect([...page.openBooks.value]).toEqual(['a']);
      page.toggleBook('b', { target: { open: true } });
      expect([...page.openBooks.value]).toEqual(['a', 'b']);
      page.toggleBook('a', { target: { open: false } });
      expect([...page.openBooks.value]).toEqual(['b']);
    } finally { scope.stop(); }
  });
  it('resets manual disclosure when changing current book or account', async () => {
    const { app, page, scope } = setupStats();
    try {
      page.toggleBook('b', { target: { open: true } });
      app.data.currentBookId = 'c';
      await nextTick();
      expect([...page.openBooks.value]).toEqual(['c']);
      page.toggleBook('a', { target: { open: true } });
      app.currentUser = { id: 'another-user' };
      await nextTick();
      expect([...page.openBooks.value]).toEqual(['c']);
    } finally { scope.stop(); }
  });
  it('updates the trend window without fabricated activity', () => {
    const { page, scope } = setupStats();
    try {
      expect(page.analytics.value.days).toHaveLength(7);
      page.range.value = 30;
      expect(page.analytics.value.days).toHaveLength(30);
      expect(page.analytics.value.reviews).toBe(0);
    } finally { scope.stop(); }
  });
});

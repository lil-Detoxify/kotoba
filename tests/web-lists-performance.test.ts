import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { initialState } from '@jp/core';
import { emptyData } from '@jp/models';
import { writeFileSync } from 'node:fs';
import { useApp } from '../apps/web/src/store';
import Lists from '../apps/web/src/pages/Lists.vue';

function readingContext(id: string, sentence: string, updatedAt: string) {
  return { id, sentence, createdAt: updatedAt, updatedAt };
}

function word(id: string, readingContexts: ReturnType<typeof readingContext>[]) {
  return { id, lessonId: 'fixture-lesson', term: id, reading: id, meaning: id, order: 0, readingContexts };
}

describe('vocabulary list navigation cost', () => {
  it('renders a small saved list without repeatedly scanning every learned word and state', async () => {
    const size = 800;
    let stateReads = 0;
    let wordReads = 0;
    const data = emptyData();
    data.seeded = true;
    data.books = [{ id: 'perf-book', title: '性能词书', description: '', language: 'ja', createdAt: '2026-10-26', updatedAt: '2026-10-26' }];
    data.lessons = [{ id: 'perf-lesson', bookId: 'perf-book', title: '性能课次', order: 1 }];
    for (let index = 0; index < size; index++) {
      const id = `perf-word-${index}`;
      const word = { id, lessonId: 'perf-lesson', term: `単語${index}`, reading: 'たんご', meaning: '测试词', order: index };
      Object.defineProperty(word, 'id', { enumerable: true, get: () => { wordReads++; return id; } });
      data.words.push(word);
      const state = initialState(id);
      state.isDifficult = index >= size - 3;
      Object.defineProperty(state, 'wordId', { enumerable: true, get: () => { stateReads++; return id; } });
      data.states.push(state);
    }
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useApp();
    store.data = data;
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/difficult', component: Lists }] });
    await router.push('/difficult');
    const app = createSSRApp(Lists).use(pinia).use(router);
    const start = performance.now();
    const html = await renderToString(app);
    const elapsed = performance.now() - start;
    const measurement = { size, stateReads, wordReads, elapsedMs: Math.round(elapsed), displayed: 3 };
    if (process.env.KOTOBUD_LISTS_MEASUREMENT) writeFileSync(process.env.KOTOBUD_LISTS_MEASUREMENT, JSON.stringify(measurement, null, 2));
    expect(html).toContain('我的生词本');
    expect(html).toContain('単語797');
    expect(html).toContain('3 个词');
    expect(stateReads).toBeLessThan(size * 20);
    expect(wordReads).toBeLessThan(size * 30);
  });

  it('refreshes reading contexts after edits, additions, and whole-data replacement, newest first', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useApp();
    const initial = emptyData();
    initial.words = [word('word-one', [readingContext('original', '元の文', '2026-10-25T00:00:00.000Z')])];
    store.data = initial;

    expect(store.readingContextsForWord('word-one').map(context => context.sentence)).toEqual(['元の文']);

    store.data.words[0].readingContexts = [
      readingContext('edited-old', '編集後の古い文', '2026-10-26T01:00:00.000Z'),
      readingContext('edited-new', '編集後の新しい文', '2026-10-26T02:00:00.000Z'),
    ];
    store.data.words.push(word('word-two', [readingContext('added', '追加した語の例文', '2026-10-26T03:00:00.000Z')]));

    expect(store.readingContextsForWord('word-one').map(context => context.sentence)).toEqual([
      '編集後の新しい文',
      '編集後の古い文',
    ]);
    expect(store.readingContextsForWord('word-two').map(context => context.sentence)).toEqual(['追加した語の例文']);

    const replacement = emptyData();
    replacement.words = [
      word('word-one', [
        readingContext('replacement-old', '替换词库中的旧句', '2026-10-26T04:00:00.000Z'),
        readingContext('replacement-new', '替换词库中的新句', '2026-10-26T05:00:00.000Z'),
      ]),
      word('word-three', [readingContext('replacement-added', '置き換え後に追加した語の例文', '2026-10-26T06:00:00.000Z')]),
    ];
    store.data = replacement;

    expect(store.readingContextsForWord('word-one').map(context => context.sentence)).toEqual([
      '替换词库中的新句',
      '替换词库中的旧句',
    ]);
    expect(store.readingContextsForWord('word-three').map(context => context.sentence)).toEqual(['置き換え後に追加した語の例文']);
  });

  it('keeps the first duplicate word ID and drops it after removal', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useApp();
    const data = emptyData();
    data.words = [
      word('duplicate', [readingContext('first', '首个词条', '2026-10-26T01:00:00.000Z')]),
      word('duplicate', [readingContext('second', '重复词条', '2026-10-26T02:00:00.000Z')]),
    ];
    store.data = data;

    expect(store.readingContextsForWord('duplicate').map(context => context.sentence)).toEqual(['首个词条']);

    store.data.words.splice(0, 1);
    expect(store.readingContextsForWord('duplicate').map(context => context.sentence)).toEqual(['重复词条']);

    store.data.words.splice(0, 1);
    expect(store.readingContextsForWord('duplicate')).toEqual([]);
  });
});

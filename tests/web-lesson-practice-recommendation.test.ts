import { describe, expect, it } from 'vitest';
import type { Word } from '@jp/models';
import { learningScenes, type LearningScene } from '../apps/web/src/services/learning-scenes';
import { lessonPracticeRecommendation } from '../apps/web/src/services/lesson-practice-recommendation';

function fromItem(scene: LearningScene, index: number, id = `${scene.id}-${index}`): Word {
  const item = scene.items[index];
  return { id, lessonId: `${item.bookId}-lesson-${id}`, term: item.term, reading: item.reading, meaning: '词义', order: index + 1 };
}

function word(id: string, bookId: string, term: string, reading: string): Word {
  return { id, lessonId: `${bookId}-lesson-${id}`, term, reading, meaning: '词义', order: 1 };
}

function dataFor(words: readonly Word[]) {
  const lessons = new Map<string, { id: string; bookId: string; title: string; order: number }>();
  for (const entry of words) {
    const bookId = entry.lessonId.split('-lesson-')[0];
    lessons.set(entry.lessonId, { id: entry.lessonId, bookId, title: '第1课', order: 1 });
  }
  return { lessons: [...lessons.values()], words: [...words] };
}

const shopping = learningScenes.find(scene => scene.id === 'shopping')!;
const dining = learningScenes.find(scene => scene.id === 'dining')!;

describe('lessonPracticeRecommendation', () => {
  it('recommends a scene from two completed exact source entries and returns the originals', () => {
    const completed = [fromItem(shopping, 0), fromItem(shopping, 1)];
    const result = lessonPracticeRecommendation(dataFor(completed), completed);

    expect(result?.kind).toBe('scene');
    if (result?.kind !== 'scene') return;
    expect(result.scene).toBe(shopping);
    expect(result.words).toEqual(completed);
    expect(result.words[0]).toBe(completed[0]);
    expect(result.href).toBe('/scenes/shopping');
  });

  it('does not combine homophones with different headwords or the same word from another book', () => {
    const exact = fromItem(shopping, 0, 'exact');
    const second = shopping.items[1];
    const wrongBook = word('wrong-book', 'other-book', second.term, second.reading);
    const wrongHead = word('wrong-head', second.bookId, '別の語', exact.reading);
    const completed = [exact, wrongBook, wrongHead];

    expect(lessonPracticeRecommendation(dataFor(completed), completed)).toBeUndefined();
  });

  it('excludes a requested scene and ignores selected word IDs', () => {
    const shopWords = [fromItem(shopping, 0), fromItem(shopping, 1)];
    const diningWords = [fromItem(dining, 0), fromItem(dining, 1)];
    const completed = [...shopWords, ...diningWords];
    const data = dataFor(completed);

    const afterExclusion = lessonPracticeRecommendation(data, completed, { excludeSceneId: shopping.id });
    expect(afterExclusion?.kind).toBe('scene');
    if (afterExclusion?.kind === 'scene') expect(afterExclusion.scene).toBe(dining);

    expect(lessonPracticeRecommendation(data, completed, {
      excludeSceneId: shopping.id,
      ignoredWordIds: new Set([diningWords[0].id]),
    })).toBeUndefined();
  });

  it('prefers more matches, then keeps the original scene order on a tie', () => {
    const twoEach = [fromItem(shopping, 0), fromItem(shopping, 1), fromItem(dining, 0), fromItem(dining, 1)];
    const tied = lessonPracticeRecommendation(dataFor(twoEach), twoEach);
    expect(tied?.kind).toBe('scene');
    if (tied?.kind === 'scene') expect(tied.scene).toBe(shopping);

    const moreShopping = [...twoEach, fromItem(shopping, 2)];
    const preferred = lessonPracticeRecommendation(dataFor(moreShopping), moreShopping);
    expect(preferred?.kind).toBe('scene');
    if (preferred?.kind === 'scene') expect(preferred.scene).toBe(shopping);
  });

  it('falls back to an exact conjugation activity and preserves the completed word', () => {
    const completed = [word('write', 'book-a', '書く', 'かく')];
    const result = lessonPracticeRecommendation(dataFor(completed), completed);

    expect(result?.kind).toBe('conjugation');
    if (result?.kind !== 'conjugation') return;
    expect(result.verb.id).toBe('write');
    expect(result.words).toEqual([completed[0]]);
    expect(result.words[0]).toBe(completed[0]);
    expect(result.href).toBe('/conjugation?verb=write&return=study');
  });

  it('returns no generic recommendation for empty or unrelated completed words', () => {
    expect(lessonPracticeRecommendation({ lessons: [], words: [] }, [])).toBeUndefined();
    const unrelated = [word('person', 'book-a', '学生', 'がくせい')];
    expect(lessonPracticeRecommendation(dataFor(unrelated), unrelated)).toBeUndefined();
  });
});

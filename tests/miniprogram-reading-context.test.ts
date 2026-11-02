import { describe, expect, it, vi } from 'vitest';
import { emptyData, type Data } from '@jp/models';
import { initialState } from '@jp/core';
import type { MiniProgramRepositoryContract } from '../apps/miniprogram/src/adapters/types';
import { createMiniReadingContexts } from '../apps/miniprogram/src/services/reading-context';
import { createPersonalLibrary, validatePersonalLibrary } from '../apps/web/src/services/personal-library';

const stamp = '2026-10-14T00:00:00.000Z';

class MemoryRepository {
  activeKey = 'data_guest';
  snapshots = new Map<string, Data>();
  getActiveKey = () => this.activeKey;
  async read(key = this.activeKey): Promise<Data> {
    return structuredClone(this.snapshots.get(key) ?? emptyData());
  }
  async transact(change: (data: Data) => void, key = this.activeKey): Promise<Data> {
    const data = structuredClone(this.snapshots.get(key) ?? emptyData());
    change(data);
    this.snapshots.set(key, data);
    return structuredClone(data);
  }
  seed(key: string, data: Data): void { this.snapshots.set(key, structuredClone(data)); }
  data(key = this.activeKey): Data { return this.snapshots.get(key) ?? emptyData(); }
}

function makeData(wordId = 'word-1'): Data {
  const data = emptyData();
  data.books.push({ id: 'personal-book', title: '我的词书', description: '', language: 'ja', createdAt: stamp, updatedAt: stamp });
  data.lessons.push({ id: 'lesson-1', bookId: 'personal-book', title: '第一课', order: 1 });
  data.words.push({ id: wordId, lessonId: 'lesson-1', term: '駅', reading: 'えき', meaning: '车站', order: 1 });
  return data;
}

function serviceFor(repository: MemoryRepository) {
  return createMiniReadingContexts(repository as unknown as MiniProgramRepositoryContract);
}

describe('Mini reading contexts', () => {
  it('deduplicates repeated saves and keeps the ID when editing a saved context', async () => {
    const repository = new MemoryRepository();
    repository.seed('data_guest', makeData());
    const service = serviceFor(repository);

    const first = await service.save('word-1', { sentence: ' 朝、本を読みます。 ', sourceUrl: 'https://example.test/story' });
    const duplicate = await service.save('word-1', { sentence: '朝、本を読みます。', sourceUrl: 'https://example.test/story', translation: '早上读书。' });
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]).toMatchObject({ id: first[0].id, createdAt: first[0].createdAt, translation: '早上读书。' });

    const edited = await service.save('word-1', { sentence: '昨日、本を読みました。', sourceUrl: 'https://example.test/story' }, first[0].id);
    expect(edited).toHaveLength(1);
    expect(edited[0]).toMatchObject({ id: first[0].id, createdAt: first[0].createdAt, sentence: '昨日、本を読みました。' });
  });

  it('removes only the selected context while preserving learning states, logs, and book selection', async () => {
    const repository = new MemoryRepository();
    const data = makeData();
    const word = data.words[0];
    word.readingContexts = [
      { id: 'context-a', sentence: '駅で会いましょう。', createdAt: stamp, updatedAt: stamp },
      { id: 'context-b', sentence: '駅まで歩きます。', createdAt: stamp, updatedAt: stamp },
    ];
    data.states.push({ ...initialState(word.id, new Date(stamp), 'guest'), status: 'review', isDifficult: true, reviewCount: 3, lapseCount: 1, bookId: 'personal-book', lessonId: 'lesson-1' });
    data.logs.push({ id: 'log-1', userId: 'guest', wordId: word.id, reviewedAt: stamp, rating: 3, responseTime: 900, previousState: {} as Data['states'][number], newState: {} as Data['states'][number], studyMode: 'review' } as Data['logs'][number]);
    data.currentBookId = 'personal-book';
    repository.seed('data_guest', data);
    const before = structuredClone(data);

    await serviceFor(repository).remove(word.id, 'context-a');
    const after = repository.data();
    expect(after.words[0].readingContexts).toEqual([before.words[0].readingContexts![1]]);
    expect(after.states).toEqual(before.states);
    expect(after.logs).toEqual(before.logs);
    expect(after.currentBookId).toBe(before.currentBookId);
  });

  it('refuses operations requested for a different active owner without writing that partition', async () => {
    const repository = new MemoryRepository();
    repository.seed('data_guest', makeData());
    const other = makeData('other-word');
    repository.seed('data_user_other', other);
    const otherBefore = structuredClone(other);
    const service = serviceFor(repository);

    await expect(service.save('other-word', { sentence: '別のアカウントの句。' }, undefined, 'data_user_other')).rejects.toThrow('账户已切换');
    await expect(service.read('other-word', 'data_user_other')).rejects.toThrow('账户已切换');
    expect(repository.data('data_user_other')).toEqual(otherBefore);
  });

  it('accepts HTTPS source URLs without a global URL constructor and preserves them in a validated library', async () => {
    const repository = new MemoryRepository();
    repository.seed('data_guest', makeData());
    const service = serviceFor(repository);
    let saved: Awaited<ReturnType<typeof service.save>> = [];
    let library = createPersonalLibrary(repository.data(), []);
    vi.stubGlobal('URL', undefined);
    try {
      saved = await service.save('word-1', { sentence: '駅で会いましょう。', sourceUrl: 'https://EXAMPLE.test/story' });
      library = createPersonalLibrary(repository.data(), []);
      library = validatePersonalLibrary(library);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(saved[0].sourceUrl).toBe('https://EXAMPLE.test/story');
    expect(library.words[0].readingContexts?.[0].sourceUrl).toBe('https://EXAMPLE.test/story');
  });
});

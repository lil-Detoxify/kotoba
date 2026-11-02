import type { Data, ReadingContext } from '@jp/models';
import { defaultRepository } from '../adapters';
import type { MiniProgramRepositoryContract } from '../adapters/types';
import { cleanReadingContext, upsertReadingContext, wordReadingContexts, type ReadingContextDraft } from '../../../web/src/services/reading-context';

export { cleanReadingContext, wordReadingContexts };
export type { ReadingContextDraft };

export function createMiniReadingContexts(repository: MiniProgramRepositoryContract = defaultRepository) {
  async function read(wordId: string, owner = repository.getActiveKey()): Promise<ReadingContext[]> {
    const data = await repository.read(owner);
    if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新打开词条。');
    return wordReadingContexts(data.words.find(word => word.id === wordId));
  }
  async function save(wordId: string, draft: ReadingContextDraft, contextId?: string, owner = repository.getActiveKey()): Promise<ReadingContext[]> {
    const clean = cleanReadingContext(draft);
    let result: ReadingContext[] = [];
    if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新打开词条。');
    await repository.transact((data: Data) => {
      if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新打开词条。');
      const word = data.words.find(word => word.id === wordId);
      if (!word) throw new Error('请先载入这条词汇，再收藏原句。');
      result = upsertReadingContext(wordReadingContexts(word), clean, {
        contextId, now: new Date(), createId: () => `context_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      }).contexts;
      word.readingContexts = result;
    }, owner);
    return result;
  }
  async function remove(wordId: string, contextId: string, owner = repository.getActiveKey()): Promise<ReadingContext[]> {
    let result: ReadingContext[] = [];
    if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新打开词条。');
    await repository.transact((data: Data) => {
      if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新打开词条。');
      const word = data.words.find(word => word.id === wordId);
      if (!word) throw new Error('词条暂时无法读取，请重新打开。');
      result = wordReadingContexts(word).filter(context => context.id !== contextId);
      word.readingContexts = result;
    }, owner);
    return result;
  }
  return { read, save, remove };
}

export const miniReadingContexts = createMiniReadingContexts();

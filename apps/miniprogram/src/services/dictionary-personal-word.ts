import type { DictionarySearchResult } from './dictionary-comparison';
import type { DictionaryWordDraft } from '../../../web/src/services/dictionary-search';
import { defaultRepository } from '../adapters';
import type { MiniProgramRepositoryContract } from '../adapters/types';
import { ensureStudyRuntime } from '../adapters/runtime';
import { collectDictionaryWord } from '../../../web/src/services/dictionary-personal-word';

export type MiniDictionaryWordCollection = { status: 'saved' | 'existing'; wordId: string };

/** An explicit dictionary save adds personal content under the captured mini-program account. */
export function createMiniDictionaryPersonalWord(repository: MiniProgramRepositoryContract = defaultRepository) {
  async function collect(result: DictionarySearchResult): Promise<MiniDictionaryWordCollection> {
    if (result.language === 'empty') throw new Error('词典词条暂无可保存的释义。');

    ensureStudyRuntime();
    const owner = repository.getActiveKey();
    let saved: MiniDictionaryWordCollection | undefined;
    const draft: DictionaryWordDraft = {
      entryId: result.id,
      term: result.term,
      reading: result.reading,
      meaning: result.meaning,
      partOfSpeech: result.partOfSpeech,
    };
    if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新查词后再收藏。');
    await repository.transact((data) => {
      if (owner !== repository.getActiveKey()) throw new Error('账户已切换，请重新查词后再收藏。');
      saved = collectDictionaryWord(data, draft);
    }, owner);
    if (!saved) throw new Error('收藏失败，请重试。');
    return saved;
  }

  return { collect };
}

const miniDictionaryPersonalWord = createMiniDictionaryPersonalWord();

export function collectMiniDictionaryWord(result: DictionarySearchResult): Promise<MiniDictionaryWordCollection> {
  return miniDictionaryPersonalWord.collect(result);
}

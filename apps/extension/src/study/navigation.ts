import { getBrowser } from '../browser';
import type { ExtensionWord } from '../model';
import { grammarAfterVocabulary } from '../../../web/src/services/grammar-navigation';

export function grammarForExtensionVocabulary(newWords: readonly ExtensionWord[]) {
  const first = newWords[0];
  const match = first?.source === 'textbook' ? /^(biaori-beginner-(?:upper|lower))-l-(\d+)$/.exec(first.lessonId) : null;
  if (!match) return;
  return grammarAfterVocabulary([{id:first.lessonId, bookId:match[1], order:Number(match[2]), title:first.lessonTitle ?? ''}], newWords);
}

export function studyHref(route: string): string {
  return `${getBrowser()?.runtime.getURL('study.html') ?? './study.html'}#${route}`;
}

export function grammarHref(bookId: string, order?: number): string | undefined {
  const upper = bookId === 'biaori-beginner-upper';
  if (!upper && bookId !== 'biaori-beginner-lower') return;
  if (order === undefined) return studyHref(`/books/${bookId}`);
  if (Number.isInteger(order) && order >= (upper ? 1 : 25) && order <= (upper ? 24 : 48)) {
    return studyHref(`/grammar/${bookId}/${order}`);
  }
}

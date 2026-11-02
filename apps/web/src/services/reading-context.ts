import type { ReadingContext, Word } from '@jp/models';

export interface ReadingContextDraft {
  sentence: string;
  translation?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  matchedText?: string;
}

/** Mini Program JS runtimes may omit the browser URL constructor. */
function sourceAddress(value: string): string {
  if (typeof URL === 'function') {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
    return url.href;
  }
  const match = /^(https?):\/\/([^\s/?#]+)([^\s]*)$/iu.exec(value);
  if (!match || /[\\<>"']/u.test(value)) throw new Error();
  const authority = match[2];
  if (!/^(?:[^@]+@)?(?:\[[0-9a-f:.]+\]|[^:[\]]+)(?::\d+)?$/iu.test(authority)) throw new Error();
  const suffix = match[3];
  return `${match[1].toLowerCase()}://${authority}${!suffix || /^[?#]/u.test(suffix) ? '/' : ''}${suffix}`;
}

function text(value: unknown, label: string, maximum: number): string | undefined {
  const clean = typeof value === 'string' ? value.trim().replace(/\r\n?/gu, '\n') : '';
  if (clean.length > maximum) throw new Error(`${label}最多 ${maximum} 个字符。`);
  return clean || undefined;
}

export function cleanReadingContext(draft: ReadingContextDraft): ReadingContextDraft {
  const sentence = text(draft.sentence, '原句', 2000);
  if (!sentence) throw new Error('请填写想收藏的阅读原句。');
  const sourceUrl = text(draft.sourceUrl, '来源网址', 2048);
  let normalizedUrl: string | undefined;
  if (sourceUrl) {
    try {
      normalizedUrl = sourceAddress(sourceUrl);
    } catch {
      throw new Error('来源网址请填写完整的 http 或 https 地址。');
    }
  }
  return {
    sentence,
    translation: text(draft.translation, '翻译', 2000),
    sourceTitle: text(draft.sourceTitle, '来源名称', 200),
    sourceUrl: normalizedUrl,
    matchedText: text(draft.matchedText, '原文词形', 200),
  };
}

export function wordReadingContexts(word: Pick<Word, 'readingContexts'> | undefined): ReadingContext[] {
  return Array.isArray(word?.readingContexts) ? word.readingContexts.filter(context => context
    && typeof context.id === 'string' && typeof context.sentence === 'string' && context.sentence.trim()
    && typeof context.createdAt === 'string' && typeof context.updatedAt === 'string') : [];
}

function contextKey(context: ReadingContextDraft): string {
  return JSON.stringify([
    context.sentence.normalize('NFKC').replace(/\s+/gu, ' ').trim(),
    context.sourceUrl || context.sourceTitle || '',
  ]);
}

export function upsertReadingContext(
  contexts: readonly ReadingContext[], draft: ReadingContextDraft,
  options: { contextId?: string; now: Date; createId: () => string },
): { contexts: ReadingContext[]; id: string; created: boolean } {
  const clean = cleanReadingContext(draft);
  const editing = options.contextId ? contexts.find(context => context.id === options.contextId) : undefined;
  if (options.contextId && !editing) throw new Error('这条原句已不在词条中，请重新打开后再修改。');
  const duplicate = contexts.find(context => contextKey(context) === contextKey(clean));
  if (editing && duplicate && editing.id !== duplicate.id) throw new Error('这句已收藏，可直接修改已有原句。');
  const previous = editing ?? duplicate;
  const now = options.now.toISOString();
  const content = editing || !previous ? clean : {
    ...clean,
    translation: clean.translation ?? previous.translation,
    sourceTitle: clean.sourceTitle ?? previous.sourceTitle,
    sourceUrl: clean.sourceUrl ?? previous.sourceUrl,
    matchedText: clean.matchedText ?? previous.matchedText,
  };
  const saved: ReadingContext = { ...content, id: previous?.id ?? options.createId(), createdAt: previous?.createdAt ?? now, updatedAt: now };
  return { contexts: [...contexts.filter(context => context.id !== saved.id), saved], id: saved.id, created: !previous };
}

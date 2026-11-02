import { normalizeVocabularySearchText as normalize } from '@jp/shared';

export interface DictionaryQuery { term: string; reading: string; partOfSpeech?: string }
type Kind = 'godan' | 'ichidan' | 'suru' | 'kuru' | 'i-adjective' | 'na-adjective';
const iToU: Record<string, string> = { い: 'う', き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', び: 'ぶ', み: 'む', り: 'る' };

function kindsFor(entry: DictionaryQuery): Kind[] {
  const pos = entry.partOfSpeech?.normalize('NFKC') ?? '';
  const kinds: Kind[] = [];
  if (/五段|[动動]1|godan|\bv5/iu.test(pos)) kinds.push('godan');
  if (/一段|[动動]2|ichidan|\bv1\b/iu.test(pos)) kinds.push('ichidan');
  if (/カ[変变]|kuru/iu.test(pos)) kinds.push('kuru');
  if (/サ[変变]|suru/iu.test(pos)) kinds.push('suru');
  if (/[动動]3/u.test(pos)) {
    const reading = normalize(entry.reading);
    kinds.push(/(?:くる|きます)$/u.test(reading) && /(?:来る|来ます|くる|きます)$/u.test(normalize(entry.term)) ? 'kuru' : 'suru');
  }
  const na = /形2|形容[动動]词|形容動詞|[なナ]形容|adjectival noun|adj-na/iu.test(pos);
  if (na) kinds.push('na-adjective');
  if (!na && /形1|[いイ]形容|形容[词詞]|i-adjective|adj-i/iu.test(pos)) kinds.push('i-adjective');
  return [...new Set(kinds)];
}

function canonical(value: string, kind: Kind, preserveScript = false): string | undefined {
  let text = preserveScript ? value.normalize('NFKC').replace(/\s+/gu, '') : normalize(value);
  if (!text) return undefined;
  if (kind === 'i-adjective') {
    if (!preserveScript && text.endsWith('いい')) text = text.slice(0, -2) + 'よい';
    return text.endsWith('い') ? text : undefined;
  }
  if (kind === 'na-adjective') return text.replace(/(?:です|だ)$/u, '') || undefined;
  if (kind === 'suru') {
    if (text.endsWith('します')) return text.slice(0, -3) + 'する';
    return text.endsWith('する') ? text : text + 'する';
  }
  if (kind === 'kuru') {
    if (text.endsWith('来ます')) return text.slice(0, -3) + '来る';
    if (text.endsWith('きます')) return text.slice(0, -3) + 'くる';
    return /(?:来る|くる)$/u.test(text) ? text : undefined;
  }
  if (text.endsWith('ます')) {
    const stem = text.slice(0, -2);
    if (!stem) return undefined;
    if (kind === 'ichidan') return stem + 'る';
    const ending = iToU[stem.slice(-1)];
    return ending ? stem.slice(0, -1) + ending : undefined;
  }
  return (kind === 'ichidan' ? text.endsWith('る') : /[うくぐすつぬぶむる]$/u.test(text)) ? text : undefined;
}

/** Mirrors the Web lookup rule: only a word's attested lexical class can supply its base form. */
export function dictionaryLookupForms(entry: DictionaryQuery) {
  const original = { term: entry.term.normalize('NFKC').trim(), reading: entry.reading.normalize('NFKC').trim(), lemma: false };
  const forms = [original];
  for (const kind of kindsFor(entry)) {
    const term = canonical(entry.term, kind, true);
    const reading = canonical(entry.reading, kind);
    if (term && reading && !forms.some(form => form.term === term && normalize(form.reading) === reading)) {
      forms.push({ term, reading, lemma: true });
    }
  }
  return forms;
}

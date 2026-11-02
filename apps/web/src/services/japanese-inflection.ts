import { normalizeVocabularySearchText as normalize } from '@jp/shared';

export interface InflectableVocabularyEntry {
  term: string;
  reading: string;
  partOfSpeech?: string;
}

export interface VocabularyInflectionMatch {
  query: string;
  baseTerm: string;
  formLabel: string;
}

type Kind = 'godan' | 'ichidan' | 'suru' | 'kuru' | 'i-adjective' | 'na-adjective';
interface Base { kind: Kind; term: string; reading: string; displayTerm: string }
interface Candidate { formLabel: string; excludeIku?: boolean; onlyIku?: boolean; excludeAru?: boolean }

const iToU: Record<string, string> = { い: 'う', き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', び: 'ぶ', み: 'む', り: 'る' };
const aToU: Record<string, string> = { わ: 'う', か: 'く', が: 'ぐ', さ: 'す', た: 'つ', な: 'ぬ', ば: 'ぶ', ま: 'む', ら: 'る' };
const verbEndings = /[うくぐすつぬぶむる]$/u;

function kindsFor(entry: InflectableVocabularyEntry): Kind[] {
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
  return (kind === 'ichidan' ? text.endsWith('る') : verbEndings.test(text)) ? text : undefined;
}

function basesFor(entry: InflectableVocabularyEntry): Base[] {
  return kindsFor(entry).flatMap(kind => {
    const term = canonical(entry.term, kind);
    const reading = canonical(entry.reading, kind);
    return term && reading ? [{ kind, term, reading, displayTerm: canonical(entry.term, kind, true) ?? entry.term }] : [];
  });
}

/** Dictionary lookup may reuse a known lexical class, but never infer it from a suffix alone. */
export function dictionaryLookupForms(entry: InflectableVocabularyEntry): Array<{ term: string; reading: string; lemma: boolean }> {
  const original = { term: entry.term.normalize('NFKC').trim(), reading: entry.reading.normalize('NFKC').trim(), lemma: false };
  const forms = [original];
  for (const base of basesFor(entry)) {
    if (!forms.some(form => form.term === base.displayTerm && normalize(form.reading) === base.reading)) {
      forms.push({ term: base.displayTerm, reading: base.reading, lemma: true });
    }
  }
  return forms;
}

function queryCandidates(query: string): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  const add = (kind: Kind, base: string, formLabel: string, exceptions: Omit<Candidate, 'formLabel'> = {}) => {
    if (!base || !/[\p{Script=Hiragana}\p{Script=Han}]/u.test(base)) return;
    const key = `${kind}\0${base}`;
    if (!candidates.has(key)) candidates.set(key, { formLabel, ...exceptions });
  };
  const stemForms = (stem: string, label: string) => {
    if (!stem) return;
    add('ichidan', stem + 'る', label);
    const ending = iToU[stem.slice(-1)];
    if (ending) add('godan', stem.slice(0, -1) + ending, label);
    if (stem.endsWith('し')) add('suru', stem.slice(0, -1) + 'する', label);
    if (stem.endsWith('き')) add('kuru', stem.slice(0, -1) + 'くる', label);
    if (stem.endsWith('来')) add('kuru', stem + 'る', label);
  };
  const teOrTaForms = (value: string, te: boolean, label: string) => {
    const single = te ? 'て' : 'た';
    if (value.endsWith(single) && value.length > 1) add('ichidan', value.slice(0, -1) + 'る', label);
    for (const [suffix, endings] of [
      [te ? 'って' : 'った', ['う', 'つ', 'る']],
      [te ? 'んで' : 'んだ', ['む', 'ぶ', 'ぬ']],
      [te ? 'いて' : 'いた', ['く']],
      [te ? 'いで' : 'いだ', ['ぐ']],
      [te ? 'して' : 'した', ['す']],
    ] as const) {
      if (!value.endsWith(suffix)) continue;
      const stem = value.slice(0, -suffix.length);
      for (const ending of endings) if (stem) add('godan', stem + ending, label, { excludeIku: ending === 'く' });
      if (stem && suffix === (te ? 'って' : 'った')) add('godan', stem + 'く', label, { onlyIku: true });
    }
    for (const [suffix, replacement, kind] of [
      [te ? 'して' : 'した', 'する', 'suru'],
      [te ? 'きて' : 'きた', 'くる', 'kuru'],
      [te ? '来て' : '来た', '来る', 'kuru'],
      [te ? '行って' : '行った', '行く', 'godan'],
      [te ? 'いって' : 'いった', 'いく', 'godan'],
    ] as const) if (value.endsWith(suffix)) add(kind, value.slice(0, -suffix.length) + replacement, label, { onlyIku: replacement.endsWith('いく') || replacement === '行く' });
  };
  const naiForms = (value: string, label: string) => {
    if (!value.endsWith('ない')) return;
    const stem = value.slice(0, -2);
    if (stem) {
      add('ichidan', stem + 'る', label);
      const ending = aToU[stem.slice(-1)];
      if (ending) add('godan', stem.slice(0, -1) + ending, label, { excludeAru: ending === 'る' });
    }
    for (const [suffix, replacement, kind] of [
      ['しない', 'する', 'suru'], ['こない', 'くる', 'kuru'], ['来ない', '来る', 'kuru'],
    ] as const) if (value.endsWith(suffix)) add(kind, value.slice(0, -suffix.length) + replacement, label);
    if (value === 'ない') add('godan', 'ある', label);
  };

  // Long suffixes go first so the displayed explanation describes the whole form.
  for (const [suffix, label] of [
    ['ませんでした', '礼貌过去否定'], ['ました', '礼貌过去'], ['ません', '礼貌否定'], ['ます', '礼貌式'], ['ましょう', '意向式'],
  ] as const) if (query.endsWith(suffix)) stemForms(query.slice(0, -suffix.length), label);

  for (const [suffix, label] of [
    ['いませんでした', 'て形＋いる · 礼貌过去否定'], ['いました', 'て形＋いる · 礼貌过去'],
    ['いません', 'て形＋いる · 礼貌否定'], ['います', 'て形＋いる · 礼貌式'],
    ['いなかった', 'て形＋いる · 过去否定'], ['いない', 'て形＋いる · 否定'],
    ['いる', 'て形＋いる'], ['いた', 'て形＋いる · 过去'],
  ] as const) {
    if (!query.endsWith(suffix)) continue;
    const te = query.slice(0, -suffix.length);
    if (/[てで]$/u.test(te)) teOrTaForms(te, true, label);
  }

  if (query.endsWith('なかった')) naiForms(query.slice(0, -4) + 'ない', '过去否定');
  naiForms(query, '否定式');
  teOrTaForms(query, true, 'て形');
  teOrTaForms(query, false, '过去式');

  const plain = query.endsWith('です') ? query.slice(0, -2) : query;
  for (const [suffix, label] of [
    ['たくなかった', '愿望 · 过去否定'], ['たくない', '愿望 · 否定'], ['たかった', '愿望 · 过去'], ['たい', '愿望式'],
  ] as const) if (plain.endsWith(suffix)) stemForms(plain.slice(0, -suffix.length), label);
  for (const [suffix, label] of [
    ['くありませんでした', '礼貌过去否定'], ['くありません', '礼貌否定'],
    ['くなかった', '过去否定'], ['くない', '否定式'], ['かった', '过去式'], ['くて', 'て形'],
  ] as const) if (plain.endsWith(suffix)) add('i-adjective', plain.slice(0, -suffix.length) + 'い', label);
  if (query.endsWith('です')) add('i-adjective', plain, '礼貌式');
  for (const [suffix, label] of [
    ['ではありませんでした', '礼貌过去否定'], ['じゃありませんでした', '礼貌过去否定'],
    ['ではありません', '礼貌否定'], ['じゃありません', '礼貌否定'],
    ['ではなかった', '过去否定'], ['じゃなかった', '过去否定'],
    ['ではない', '否定式'], ['じゃない', '否定式'], ['だった', '过去式'], ['でした', '礼貌过去'], ['です', '礼貌式'],
  ] as const) if (plain.endsWith(suffix)) add('na-adjective', plain.slice(0, -suffix.length), label);
  // です itself was removed above only to recognize polite adjective negation.
  if (query.endsWith('です')) add('na-adjective', plain, '礼貌式');
  return candidates;
}

/** Match a whole inflected word against attested POS/reading pairs; this is not a sentence parser. */
export function createVocabularyInflectionMatcher<T extends InflectableVocabularyEntry>(
  entries: readonly T[], rawQuery: string,
): ((entry: T) => VocabularyInflectionMatch | undefined) | undefined {
  const query = normalize(rawQuery);
  const candidates = queryCandidates(query);
  if (!candidates.size) return undefined;
  const bases = new Map<T, Base[]>();
  const hints = new Map<string, Base[]>();
  const remember = (key: string, values: Base[]) => {
    const previous = hints.get(key) ?? [];
    hints.set(key, [...previous, ...values].filter((base, index, all) => all.findIndex(item => item.kind === base.kind && item.term === base.term && item.reading === base.reading) === index));
  };
  for (const entry of entries) {
    const values = basesFor(entry);
    if (!values.length) continue;
    bases.set(entry, values);
    remember(`${normalize(entry.term)}\0${normalize(entry.reading)}`, values);
    for (const base of values) remember(`${base.term}\0${base.reading}`, [base]);
  }
  return entry => {
    const pos = entry.partOfSpeech?.trim() ?? '';
    // Unlabelled personal words can reuse a known lexical classification, never a blind suffix guess.
    const values = bases.get(entry) ?? (!pos || /^(?:[动動][词詞]|verb)$/iu.test(pos)
      ? hints.get(`${normalize(entry.term)}\0${normalize(entry.reading)}`) : undefined);
    for (const base of values ?? []) {
      const candidate = [candidates.get(`${base.kind}\0${base.term}`), candidates.get(`${base.kind}\0${base.reading}`)].find(item => item
        && !(item.excludeIku && base.reading.endsWith('いく'))
        && !(item.onlyIku && !base.reading.endsWith('いく'))
        && !(item.excludeAru && base.reading === 'ある'));
      if (candidate) return { query: rawQuery.trim(), baseTerm: base.displayTerm, formLabel: candidate.formLabel };
    }
    return undefined;
  };
}

import { normalizeVocabularySearchText } from '@jp/shared';
import payload from '../learning-verbs.json';

export type VerbGroup = 'godan' | 'ichidan' | 'irregular';
export type ConjugationForm = 'masu' | 'te' | 'ta' | 'nai';
export interface VerbDefinition {
  id: string; term: string; reading: string; meaning: string; group: VerbGroup;
  forms: Array<{ term: string; reading: string }>;
  examples: Record<ConjugationForm, { ja: string; zh: string }>;
}
export const conjugationVerbs: readonly VerbDefinition[] = payload as VerbDefinition[];
export const CONJUGATION_FORMS = [
  { id: 'masu', label: 'ます形', description: '礼貌地叙述动作' },
  { id: 'te', label: 'て形', description: '连接动作或表达请求' },
  { id: 'ta', label: 'た形', description: '表达过去发生的动作' },
  { id: 'nai', label: 'ない形', description: '表达不做某个动作' },
] as const;
export const VERB_GROUP_LABELS: Record<VerbGroup, string> = { godan: '五段动词', ichidan: '一段动词', irregular: '不规则动词' };
export interface ConjugationAnswer { written: string; reading: string; rule: string }
export interface ConjugationQuestion { id: string; verb: VerbDefinition; form: ConjugationForm }
export interface ConjugationResult { input: string; correct: boolean }
export interface ConjugationRound { questions: ConjugationQuestion[]; index: number; results: Record<string, ConjugationResult> }

const godan: Record<string, { masu: string; nai: string; te: string; ta: string }> = {
  'う': { masu: 'い', nai: 'わ', te: 'って', ta: 'った' },
  'く': { masu: 'き', nai: 'か', te: 'いて', ta: 'いた' },
  'ぐ': { masu: 'ぎ', nai: 'が', te: 'いで', ta: 'いだ' },
  'す': { masu: 'し', nai: 'さ', te: 'して', ta: 'した' },
  'つ': { masu: 'ち', nai: 'た', te: 'って', ta: 'った' },
  'ぬ': { masu: 'に', nai: 'な', te: 'んで', ta: 'んだ' },
  'ぶ': { masu: 'び', nai: 'ば', te: 'んで', ta: 'んだ' },
  'む': { masu: 'み', nai: 'ま', te: 'んで', ta: 'んだ' },
  'る': { masu: 'り', nai: 'ら', te: 'って', ta: 'った' },
};

/** Groups are curated. Do not infer a verb's group solely from its ending. */
export function conjugate(verb: VerbDefinition, form: ConjugationForm): ConjugationAnswer {
  if (verb.group === 'irregular') {
    if (verb.reading === 'くる') {
      const table = { masu: ['来ます', 'きます'], te: ['来て', 'きて'], ta: ['来た', 'きた'], nai: ['来ない', 'こない'] };
      const [written, reading] = table[form];
      return { written, reading, rule: `来る的读音随变化改变，这里读作「${reading}」。` };
    }
    if (!verb.term.endsWith('する') || !verb.reading.endsWith('する')) throw new Error('尚未提供这个动词的活用。');
    const ending = { masu: 'します', te: 'して', ta: 'した', nai: 'しない' }[form];
    return { written: verb.term.slice(0, -2) + ending, reading: verb.reading.slice(0, -2) + ending, rule: `する是不规则动词，在这里变为「${ending}」。` };
  }
  const last = verb.reading.slice(-1);
  if (verb.group === 'ichidan') {
    const ending = { masu: 'ます', te: 'て', ta: 'た', nai: 'ない' }[form];
    return { written: verb.term.slice(0, -1) + ending, reading: verb.reading.slice(0, -1) + ending, rule: `一段动词去掉末尾「る」，再加「${ending}」。` };
  }
  if (verb.id === 'exist' && form === 'nai') return { written: 'ない', reading: 'ない', rule: 'ある的ない形是「ない」，不使用「あらない」。' };
  const row = godan[last];
  if (!row) throw new Error('尚未提供这个动词的活用。');
  const ending = verb.id === 'go' && (form === 'te' || form === 'ta') ? (form === 'te' ? 'って' : 'った')
    : row[form] + (form === 'masu' ? 'ます' : form === 'nai' ? 'ない' : '');
  const rule = verb.id === 'go' && (form === 'te' || form === 'ta')
    ? `行く在这里是特例，使用「行${ending}」。`
    : `五段动词的末尾「${last}」变为「${ending}」。${last === 'る' ? '这个词虽然以る结尾，仍属于五段动词。' : ''}`;
  return { written: verb.term.slice(0, -1) + ending, reading: verb.reading.slice(0, -1) + ending, rule };
}

export function conjugationFor(word: { term: string; reading: string }): VerbDefinition | undefined {
  return conjugationVerbs.find(verb => verb.forms.some(form => form.term.normalize('NFKC').trim() === word.term.normalize('NFKC').trim()
    && normalizeVocabularySearchText(form.reading) === normalizeVocabularySearchText(word.reading)));
}

export function acceptsConjugation(question: ConjugationQuestion, input: string): boolean {
  const answer = conjugate(question.verb, question.form);
  const normalized = normalizeVocabularySearchText(input);
  return !!normalized && [answer.written, answer.reading].some(value => normalizeVocabularySearchText(value) === normalized);
}

export function createConjugationRound(verbs: readonly VerbDefinition[], forms: readonly ConjugationForm[], count = 12, random = Math.random): ConjugationRound {
  const shuffled = [...new Map(verbs.map(verb => [verb.id, verb])).values()];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swap = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const targets = [...new Set(forms)];
  const pool = targets.flatMap((_, cycle) => shuffled.map((verb, index) => {
    const form = targets[(index + cycle) % targets.length];
    return { id: `${verb.id}:${form}`, verb, form };
  }));
  const questions = pool.slice(0, Math.max(0, count));
  return { questions, index: 0, results: {} };
}

/** Confirmation and advancement use the rendered question ID to ignore double taps. */
export function confirmConjugation(round: ConjugationRound, questionId: string, input: string): ConjugationRound {
  const question = round.questions[round.index];
  if (!question || question.id !== questionId || round.results[questionId] || !input.trim()) return round;
  return { ...round, results: { ...round.results, [questionId]: { input: input.trim(), correct: acceptsConjugation(question, input) } } };
}
export function advanceConjugation(round: ConjugationRound, questionId: string): ConjugationRound {
  if (round.questions[round.index]?.id !== questionId || !round.results[questionId]) return round;
  return { ...round, index: round.index + 1 };
}
export function retryConjugation(round: ConjugationRound): ConjugationRound {
  return { questions: round.questions.filter(question => round.results[question.id]?.correct === false), index: 0, results: {} };
}

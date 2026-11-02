import { normalizeKanaAnswer } from './kana-input';

export interface KanaAnswerDiff {
  submitted: Array<{ text: string; kind: 'same' | 'extra' | 'changed' }>;
  correct: Array<{ text: string; kind: 'same' | 'missing' | 'changed' }>;
  hint: string;
  matches: boolean;
}

type Edit =
  | { type: 'same'; submitted: string; correct: string }
  | { type: 'extra'; submitted: string }
  | { type: 'missing'; correct: string }
  | { type: 'changed'; submitted: string; correct: string };

/** Aligns normalized kana answers without trying to infer their meaning. */
export function analyzeKanaAnswer(submitted: string | null, correct: string): KanaAnswerDiff {
  const actual = Array.from(normalizeKanaAnswer(submitted ?? ''));
  const expected = Array.from(normalizeKanaAnswer(correct));
  const matches = actual.join('') === expected.join('');

  if (!actual.length) {
    return {
      submitted: [],
      correct: expected.length ? [{ text: expected.join(''), kind: 'missing' }] : [],
      hint: '先听一遍，再试着输入。',
      matches,
    };
  }

  const costs = Array.from({ length: actual.length + 1 }, () => new Array<number>(expected.length + 1).fill(0));
  for (let i = actual.length; i >= 0; i--) costs[i][expected.length] = actual.length - i;
  for (let j = expected.length; j >= 0; j--) costs[actual.length][j] = expected.length - j;

  for (let i = actual.length - 1; i >= 0; i--) {
    for (let j = expected.length - 1; j >= 0; j--) {
      costs[i][j] = actual[i] === expected[j]
        ? costs[i + 1][j + 1]
        : 1 + Math.min(costs[i + 1][j + 1], costs[i + 1][j], costs[i][j + 1]);
    }
  }

  const edits: Edit[] = [];
  let i = 0;
  let j = 0;
  while (i < actual.length || j < expected.length) {
    if (i < actual.length && j < expected.length && actual[i] === expected[j]) {
      edits.push({ type: 'same', submitted: actual[i], correct: expected[j] });
      i++;
      j++;
      continue;
    }

    const best = costs[i][j];
    // Prefer preserving matching characters later in the string over replacing
    // one of them when an insertion/deletion is equally cheap.
    if (j < expected.length && best === 1 + costs[i][j + 1]) {
      edits.push({ type: 'missing', correct: expected[j++] });
    } else if (i < actual.length && best === 1 + costs[i + 1][j]) {
      edits.push({ type: 'extra', submitted: actual[i++] });
    } else if (i < actual.length && j < expected.length) {
      edits.push({ type: 'changed', submitted: actual[i++], correct: expected[j++] });
    } else if (i < actual.length) {
      edits.push({ type: 'extra', submitted: actual[i++] });
    } else {
      edits.push({ type: 'missing', correct: expected[j++] });
    }
  }

  const submittedParts = edits.map(edit => edit.type === 'missing'
    ? null
    : { text: edit.submitted, kind: edit.type === 'same' ? 'same' as const : edit.type === 'extra' ? 'extra' as const : 'changed' as const })
    .filter((part): part is NonNullable<typeof part> => part !== null);
  const correctParts = edits.map(edit => edit.type === 'extra'
    ? null
    : { text: edit.correct, kind: edit.type === 'same' ? 'same' as const : edit.type === 'missing' ? 'missing' as const : 'changed' as const })
    .filter((part): part is NonNullable<typeof part> => part !== null);

  return { submitted: mergeParts(submittedParts), correct: mergeParts(correctParts), hint: makeHint(edits), matches };
}

function mergeParts<T extends { text: string; kind: string }>(parts: T[]): T[] {
  return parts.reduce<T[]>((result, part) => {
    const previous = result[result.length - 1];
    if (previous?.kind === part.kind) previous.text += part.text;
    else result.push({ ...part });
    return result;
  }, []);
}

function makeHint(edits: Edit[]): string {
  if (edits.some(edit => edit.type === 'missing' && edit.correct === 'っ')) {
    return '漏写了促音「っ」，留意这里要短促停顿。';
  }

  const smallKana = new Set(Array.from('ぁぃぅぇぉゃゅょっゎ'));
  const smallEdit = edits.find(edit => (edit.type === 'missing' && smallKana.has(edit.correct))
    || (edit.type === 'extra' && smallKana.has(edit.submitted))
    || (edit.type === 'changed' && (smallKana.has(edit.submitted) || smallKana.has(edit.correct))));
  if (smallEdit?.type === 'missing') return `这里需要小假名「${smallEdit.correct}」。`;
  if (smallEdit?.type === 'extra') return `这里多写了小假名「${smallEdit.submitted}」。`;
  if (smallEdit?.type === 'changed') {
    return smallKana.has(smallEdit.correct)
      ? `「${smallEdit.submitted}」应写成小假名「${smallEdit.correct}」。`
      : `这里应写「${smallEdit.correct}」，留意大小假名的区别。`;
  }

  if (edits.some(edit => edit.type === 'changed' && sameBaseKana(edit.submitted, edit.correct))) {
    return '注意清音、浊音或半浊音的区别。';
  }

  if (edits.some(edit => edit.type === 'missing' && edit.correct === 'ー')) {
    return '这里漏了长音符「ー」。';
  }

  const first = edits.find(edit => edit.type !== 'same');
  if (!first) return '';
  if (first.type === 'missing') return `少了「${first.correct}」。`;
  if (first.type === 'extra') return `多写了「${first.submitted}」。`;
  if (first.type === 'changed') return `「${first.submitted}」应写作「${first.correct}」。`;
  return '';
}

function sameBaseKana(left: string, right: string): boolean {
  const base = (value: string) => value.normalize('NFD').replace(/[\u3099\u309a]/gu, '');
  return base(left) === base(right) && left !== right;
}

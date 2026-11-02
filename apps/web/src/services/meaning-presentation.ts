import type { Word } from '@jp/models';

/** Keep the textbook gloss intact; only shorten what is shown at a glance. */
export function meaningParts(meaning: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  for (const character of meaning) {
    if ('（([【'.includes(character)) depth++;
    if ('）)]】'.includes(character)) depth = Math.max(0, depth - 1);
    if ((character === '；' || character === ';') && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return [...new Set(parts)];
}

export function shortMeaning(meaning: string): string {
  const parts = meaningParts(meaning);
  if (!parts.length) return meaning;
  const firstTwo = parts.slice(0, 2).join('、');
  return firstTwo.length <= 24 ? firstTwo : parts[0];
}

export function meaningPresentation(word: Pick<Word, 'lessonId' | 'meaning'>) {
  if (!word.lessonId.startsWith('jlpt-n')) return { summary: word.meaning, parts: [word.meaning], hasMore: false };
  const parts = meaningParts(word.meaning);
  const summary = shortMeaning(word.meaning);
  return { summary, parts, hasMore: parts.join('、') !== summary };
}

/** Options still submit their original value; extend colliding summaries until distinguishable. */
export function meaningOptionLabels(options: string[]): string[] {
  const parts = options.map(meaningParts);
  const labels = options.map(shortMeaning);
  for (let index = 0; index < options.length; index++) {
    if (!labels.some((label, other) => other !== index && label === labels[index])) continue;
    for (let length = 3; length <= Math.max(...parts.map(row => row.length)); length++) {
      const candidate = parts[index].slice(0, length).join('、');
      if (parts.every((row, other) => other === index || row.slice(0, length).join('、') !== candidate)) {
        labels[index] = candidate;
        break;
      }
    }
    if (labels.some((label, other) => other !== index && label === labels[index])) labels[index] = options[index];
  }
  return labels;
}

import type { ReadingContext, Word } from '@jp/models';
import type { LearningExample } from './learning-example';
import { wordReadingContexts } from './reading-context';

export interface PersonalLearningExample {
  context: ReadingContext;
  example: LearningExample;
}

export function personalExampleFor(word: Word): PersonalLearningExample | undefined {
  const context = latestContexts(word)[0];
  return context ? { context, example: displayExample(context) } : undefined;
}

export function personalClozeExampleFor(word: Word, preferredContextId?: string): PersonalLearningExample | undefined {
  const contexts = latestContexts(word);
  const preferred = preferredContextId ? contexts.find(context => context.id === preferredContextId) : undefined;
  if (preferred) {
    const example = contextClozeExample(word, preferred);
    if (example) return { context: preferred, example };
  }
  for (const context of contexts) {
    if (context.id === preferred?.id) continue;
    const example = contextClozeExample(word, context);
    if (example) return { context, example };
  }
  return undefined;
}

export function contextClozeExample(word: Word, context: ReadingContext): LearningExample | undefined {
  if (typeof context.sentence !== 'string' || !context.sentence) return undefined;
  const target = context.matchedText ?? word.term;
  if (!target || !isSupportedAnswer(word, target)) return undefined;
  const first = context.sentence.indexOf(target);
  if (first < 0 || context.sentence.indexOf(target, first + 1) >= 0) return undefined;
  return {
    ja: context.sentence,
    reading: '',
    zh: context.translation ?? '',
    cloze: { answer: context.sentence.slice(first, first + target.length), reading: word.reading },
  };
}

function displayExample(context: ReadingContext): LearningExample {
  return { ja: context.sentence, reading: '', zh: context.translation ?? '' };
}

function latestContexts(word: Word): ReadingContext[] {
  return wordReadingContexts(word).slice().sort((left, right) =>
    contextTime(right) - contextTime(left) || timestamp(right.createdAt) - timestamp(left.createdAt));
}

function contextTime(context: ReadingContext): number {
  return timestamp(context.updatedAt) || timestamp(context.createdAt);
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isSupportedAnswer(word: Word, target: string): boolean {
  if (target === word.term) return true;
  const reading = normalizeKana(word.reading);
  return !!reading && normalizeKana(target) === reading;
}

function normalizeKana(value: string): string {
  return value.normalize('NFKC')
    .replace(/[ァ-ヶ]/gu, character => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

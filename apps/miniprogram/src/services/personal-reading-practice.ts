import { stateFor } from "@jp/core";
import type { Data, ReadingContext, Word } from "@jp/models";
import type { LearningExample } from "../../../web/src/services/learning-example";
import { contextClozeExample } from "../../../web/src/services/personal-learning-example";
import { wordReadingContexts } from "./reading-context";

export type MiniReadingContextIds = Record<string, string>;

const MAX_CONTEXT_PRACTICE_WORDS = 50;
const MAX_CONTEXT_ID_LENGTH = 200;

export function parseMiniReadingContextIds(value: unknown): MiniReadingContextIds | null {
  if (typeof value !== "string" || value.length > 10_000) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (!entries.length || entries.length > MAX_CONTEXT_PRACTICE_WORDS) return null;

  const result = Object.create(null) as MiniReadingContextIds;
  for (const [wordId, contextId] of entries) {
    if (!wordId.trim() || wordId.length > MAX_CONTEXT_ID_LENGTH
      || typeof contextId !== "string" || !contextId.trim() || contextId.length > MAX_CONTEXT_ID_LENGTH) return null;
    result[wordId] = contextId;
  }
  return result;
}

export function miniReadingContextForWord(word: Word, contextId: string): ReadingContext | undefined {
  if (!contextId) return undefined;
  const context = wordReadingContexts(word).find((candidate) => candidate.id === contextId);
  return context && typeof context.sentence === "string" && context.sentence.trim() ? context : undefined;
}

export function miniPersonalExampleFor(word: Word, contextId: string): LearningExample | undefined {
  const context = miniReadingContextForWord(word, contextId);
  return context ? { ja: context.sentence, reading: "", zh: context.translation ?? "" } : undefined;
}

export function miniPersonalClozeExampleFor(word: Word, contextId: string): LearningExample | undefined {
  const context = miniReadingContextForWord(word, contextId);
  return context ? contextClozeExample(word, context) : undefined;
}

/** Resolve only the explicitly selected, still-attached original sentences. */
export function miniReadingContextPracticeWords(data: Data, contextIds: MiniReadingContextIds): Word[] {
  const result: Word[] = [];
  const seen = new Set<string>();
  for (const [wordId, contextId] of Object.entries(contextIds)) {
    if (seen.has(wordId)) continue;
    seen.add(wordId);
    const word = data.words.find((candidate) => candidate.id === wordId);
    if (!word || stateFor(data, word.id)?.isIgnored || !miniReadingContextForWord(word, contextId)) continue;
    result.push(word);
  }
  return result;
}

import { describe, expect, it } from "vitest";
import { emptyData, type ReadingContext, type Word } from "@jp/models";
import { initialState } from "@jp/core";
import {
  miniPersonalClozeExampleFor,
  miniPersonalExampleFor,
  miniReadingContextForWord,
  miniReadingContextPracticeWords,
  parseMiniReadingContextIds,
} from "../apps/miniprogram/src/services/personal-reading-practice";

const context = (id: string, sentence: string, matchedText = "猫"): ReadingContext => ({
  id,
  sentence,
  translation: `${id} 的中文译文`,
  matchedText,
  createdAt: "2026-10-20T09:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
});

const cat: Word = {
  id: "cat",
  lessonId: "lesson-a",
  term: "猫",
  reading: "ねこ",
  meaning: "猫",
  order: 1,
  readingContexts: [context("context-a", "猫がいます。"), context("context-b", "猫が猫を見ています。")],
};

describe("Mini Program personal reading practice", () => {
  it("parses only a small map of non-empty word and context IDs", () => {
    expect(parseMiniReadingContextIds('{"cat":"context-a"}')).toEqual({ cat: "context-a" });
    expect(parseMiniReadingContextIds("not-json")).toBeNull();
    expect(parseMiniReadingContextIds('["cat","context-a"]')).toBeNull();
    expect(parseMiniReadingContextIds('{"cat":""}')).toBeNull();
  });

  it("uses only the selected attached context and falls back when a unique cloze is unsafe", () => {
    expect(miniReadingContextForWord(cat, "context-a")?.sentence).toBe("猫がいます。");
    expect(miniPersonalExampleFor(cat, "context-b")).toEqual({
      ja: "猫が猫を見ています。",
      reading: "",
      zh: "context-b 的中文译文",
    });
    expect(miniPersonalClozeExampleFor(cat, "context-a")?.cloze?.answer).toBe("猫");
    expect(miniPersonalClozeExampleFor(cat, "context-b")).toBeUndefined();
    expect(miniReadingContextForWord(cat, "removed-context")).toBeUndefined();
  });

  it("keeps practice scoped to available selected words and skips ignored or removed contexts", () => {
    const data = emptyData();
    data.words = [cat, { ...cat, id: "dog", term: "犬", reading: "いぬ", readingContexts: [context("dog-context", "犬がいます。", "犬")] }];
    const ignored = initialState("dog");
    ignored.isIgnored = true;
    data.states.push(ignored);

    expect(miniReadingContextPracticeWords(data, {
      cat: "context-a",
      dog: "dog-context",
      missing: "missing-context",
      orphaned: "not-attached",
    })).toEqual([cat]);
  });
});

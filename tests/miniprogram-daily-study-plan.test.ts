import { describe, expect, it } from "vitest";
import { emptyData } from "@jp/models";
import { initialState } from "@jp/core";
import type { StorageAdapter } from "../apps/miniprogram/src/adapters/types";
import {
  createMiniHomeDisplayPreference,
  MINI_HOME_DISPLAY_KEY,
} from "../apps/miniprogram/src/services/home-display-preference";
import {
  createMiniStudyPlanPreference,
  MINI_STUDY_PLAN_KEY,
} from "../apps/miniprogram/src/services/study-plan-preference";
import { miniDailyStudyPlan, miniDailyStudyWords } from "../apps/miniprogram/src/services/daily-study-plan";

function fixture(wordCount = 8) {
  const data = emptyData();
  data.lessons = [
    { id: "lesson-1", bookId: "book-a", title: "第一课", order: 1 },
    { id: "lesson-2", bookId: "book-a", title: "第二课", order: 2 },
    { id: "lesson-b", bookId: "book-b", title: "另一词书", order: 1 },
  ];
  data.words = Array.from({ length: wordCount + 2 }, (_, index) => ({
    id: `word-${index}`,
    lessonId: index < wordCount ? "lesson-1" : index === wordCount ? "lesson-2" : "lesson-b",
    term: `词${index}`,
    reading: "ことば",
    meaning: "测试",
    order: index,
  }));
  return data;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: Pick<StorageAdapter, "getItem" | "setItem"> = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
  return { storage, values };
}

const today = new Date("2026-10-08T12:00:00Z");

describe("Mini Program daily study plan and preferences", () => {
  it("rounds a half lesson up when its target is larger than ten words", () => {
    const data = fixture(25);
    const plan = miniDailyStudyPlan(data, "book-a", 0.5, today);
    expect(plan).toMatchObject({ lessonId: "lesson-1", target: 13, remaining: 13 });
    expect(plan.pendingWordIds).toEqual(data.words.slice(0, 13).map((word) => word.id));
  });

  it("keeps a completed same-day goal in place and advances on the next local day", () => {
    const data = fixture(4);
    const first = miniDailyStudyPlan(data, "book-a", 1, today);
    for (const wordId of first.pendingWordIds) {
      data.states.push({ ...initialState(wordId), firstSeenAt: "2026-10-08T10:00:00Z", reviewCount: 1 });
    }

    expect(miniDailyStudyPlan(data, "book-a", 1, today)).toMatchObject({
      lessonId: "lesson-1", target: 4, completed: 4, remaining: 0,
    });
    expect(miniDailyStudyPlan(data, "book-a", 1, new Date("2026-10-09T12:00:00Z"))).toMatchObject({
      lessonId: "lesson-2", target: 1, remaining: 1,
    });
  });

  it("excludes ignored words and returns original words in plan order without changing data", () => {
    const data = fixture(6);
    data.states.push({ ...initialState("word-1"), isIgnored: true });
    const before = structuredClone(data);

    const plan = miniDailyStudyPlan(data, "book-a", 0.5, today);
    const words = miniDailyStudyWords(data, "book-a", 0.5, today);
    expect(plan.pendingWordIds).toEqual(["word-0", "word-2", "word-3"]);
    expect(words).toEqual(plan.pendingWordIds.map((id) => data.words.find((word) => word.id === id)));
    expect(words[0]).toBe(data.words[0]);
    expect(data).toEqual(before);
  });

  it("includes account-partitioned non-local states when deriving progress", () => {
    const data = fixture(2);
    for (const word of data.words.filter((item) => item.lessonId === "lesson-1")) {
      data.states.push({
        ...initialState(word.id, today, "account-42"),
        firstSeenAt: "2026-10-07T10:00:00Z",
        reviewCount: 1,
      });
    }

    expect(miniDailyStudyPlan(data, "book-a", 1, today)).toMatchObject({
      lessonId: "lesson-2", target: 1, remaining: 1,
    });
  });

  it("persists independent book paces, ignores invalid values, and rejects failed saves", async () => {
    const { storage, values } = memoryStorage();
    const preference = createMiniStudyPlanPreference(storage);
    await preference.setPace("book-a", 0.5);
    await preference.setPace("book-b", 1);
    expect(preference.getPace("book-c")).toBe(1);

    const restored = createMiniStudyPlanPreference(storage);
    await restored.load();
    expect(restored.state).toMatchObject({ paces: { "book-a": 0.5, "book-b": 1 }, ready: true });
    expect(JSON.parse(values.get(MINI_STUDY_PLAN_KEY)!)).toEqual({ "book-a": 0.5, "book-b": 1 });
    await restored.setPace("book-a", 3 as unknown as 0.5);
    expect(restored.getPace("book-a")).toBe(0.5);

    const failingStorage: Pick<StorageAdapter, "getItem" | "setItem"> = {
      getItem: async () => null,
      setItem: async () => { throw new Error("storage unavailable"); },
    };
    const failing = createMiniStudyPlanPreference(failingStorage);
    await expect(failing.setPace("book-a", 0.5)).rejects.toThrow("storage unavailable");
    expect(failing.getPace("book-a")).toBe(1);
  });

  it("loads and persists the home display, defaulting to review", async () => {
    const { storage, values } = memoryStorage();
    const preference = createMiniHomeDisplayPreference(storage);
    await preference.load();
    expect(preference.state).toMatchObject({ value: "review", ready: true });
    await preference.set("today");
    expect(values.get(MINI_HOME_DISPLAY_KEY)).toBe("today");

    const restored = createMiniHomeDisplayPreference(storage);
    await restored.load();
    expect(restored.state).toMatchObject({ value: "today", ready: true });
  });

  it("retries storage reads without saving defaults after a read failure", async () => {
    let unavailable = true;
    const paceValues = new Map([[MINI_STUDY_PLAN_KEY, JSON.stringify({ "book-a": 0.5 })]]);
    const paceWrites: string[] = [];
    const paceStorage: Pick<StorageAdapter, "getItem" | "setItem"> = {
      getItem: async (key) => {
        if (unavailable) throw new Error("storage unavailable");
        return paceValues.get(key) ?? null;
      },
      setItem: async (key, value) => { paceWrites.push(key); paceValues.set(key, value); },
    };
    const pace = createMiniStudyPlanPreference(paceStorage);
    await expect(pace.load()).rejects.toThrow("storage unavailable");
    expect(pace.state.ready).toBe(false);
    await expect(pace.setPace("book-b", 1)).rejects.toThrow("storage unavailable");
    expect(paceWrites).toEqual([]);
    unavailable = false;
    await pace.load();
    expect(pace.state).toMatchObject({ paces: { "book-a": 0.5 }, ready: true });

    let displayUnavailable = true;
    const displayValues = new Map([[MINI_HOME_DISPLAY_KEY, "today"]]);
    const displayWrites: string[] = [];
    const displayStorage: Pick<StorageAdapter, "getItem" | "setItem"> = {
      getItem: async (key) => {
        if (displayUnavailable) throw new Error("storage unavailable");
        return displayValues.get(key) ?? null;
      },
      setItem: async (key, value) => { displayWrites.push(key); displayValues.set(key, value); },
    };
    const display = createMiniHomeDisplayPreference(displayStorage);
    await expect(display.load()).rejects.toThrow("storage unavailable");
    expect(display.state.ready).toBe(false);
    await expect(display.set("progress")).rejects.toThrow("storage unavailable");
    expect(displayWrites).toEqual([]);
    displayUnavailable = false;
    await display.load();
    expect(display.state).toMatchObject({ value: "today", ready: true });
  });
});

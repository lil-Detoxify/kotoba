import { describe, expect, it, vi } from "vitest";
import { MiniProgramWorkerClient } from "../apps/miniprogram/src/adapters/worker-client";
import { validateSyncPull } from "../apps/miniprogram/src/services/sync-reconciliation";

const userId = "mini-input-sync-user";
const timestamp = "2026-10-14T00:00:00.000Z";

function event(id: string, quiz?: Record<string, unknown>) {
  return {
    _id: id,
    userId,
    wordId: "word-1",
    reviewedAt: timestamp,
    rating: 3,
    responseTime: 800,
    studyMode: "review",
    clientCreatedAt: timestamp,
    ...(quiz ? { quiz } : {}),
  };
}

function pull(events: unknown[]) {
  return { userId, progress: [], events, serverTime: timestamp };
}

function inputQuiz(overrides: Record<string, unknown> = {}) {
  return {
    type: "kana-input",
    prompt: "学校",
    options: [],
    selected: "がっこう",
    correct: "がっこう",
    isCorrect: true,
    ...overrides,
  };
}

describe("mini-program input quiz sync compatibility", () => {
  it("requests input quiz events on every Worker pull, with or without a cursor", async () => {
    const requests: Array<{ url: string; options: any }> = [];
    const network = {
      request: vi.fn(async (url: string, options: any) => {
        requests.push({ url, options });
        return pull([]);
      }),
    };
    const client = new MiniProgramWorkerClient("https://example.test", network as any);

    await client.pull("token");
    await client.pull("token", timestamp);

    expect(requests.map(({ url, options }) => ({ url, data: options.data }))).toEqual([
      { url: "/api/v1/sync/pull", data: { includeInputQuizzes: true } },
      { url: "/api/v1/sync/pull", data: { since: timestamp, includeInputQuizzes: true } },
    ]);
  });

  it("accepts kana-input and dictation attempts with empty option lists", () => {
    const kanaInput = inputQuiz();
    const dictation = inputQuiz({
      type: "dictation",
      prompt: "",
      selected: "ガッコウ",
      correct: "がっこう",
      isCorrect: false,
    });
    const validated = validateSyncPull(pull([
      event("kana-input", kanaInput),
      event("dictation", dictation),
    ]), userId);

    expect(validated.events[0].quiz).toEqual(kanaInput);
    expect(validated.events[1].quiz).toEqual(dictation);
  });

  it("keeps choice quiz validation strict and rejects malformed input attempts", () => {
    const choiceQuiz = { type: "kana-meaning", prompt: "ねこ", options: ["猫", "犬"], selected: "猫", correct: "猫", isCorrect: true };
    expect(validateSyncPull(pull([event("choice", choiceQuiz)]), userId).events[0].quiz).toEqual(choiceQuiz);
    expect(() => validateSyncPull(pull([event("empty-choice-options", { ...choiceQuiz, options: [] })]), userId)).toThrow(/quiz\.options/);
    expect(() => validateSyncPull(pull([event("empty-choice-prompt", { ...choiceQuiz, prompt: "" })]), userId)).toThrow(/quiz\.prompt/);
    expect(() => validateSyncPull(pull([event("bad-input-options", inputQuiz({ options: ["がっこう"] }))]), userId)).toThrow(/quiz\.options/);
    expect(() => validateSyncPull(pull([event("empty-input-answer", inputQuiz({ correct: "" }))]), userId)).toThrow(/quiz\.correct/);
  });
});

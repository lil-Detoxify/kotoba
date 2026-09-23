import { describe, expect, it } from "vitest";
import { initialState } from "@jp/core";
import type { Data, SyncQueueItem, Word } from "@jp/models";
import {
  reconcileMiniProgramData,
  validateSyncPull,
  type ValidatedSyncPull,
} from "../apps/miniprogram/src/services/sync-reconciliation";

const userId = "user_sync_test";
const knownWord: Word = { id: "book-a-w-1", lessonId: "lesson-a", term: "猫", reading: "ねこ", meaning: "猫", order: 1 };

function cardPayload(date = "2026-09-20T00:00:00.000Z") {
  return {
    due: date,
    stability: 2,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 1,
    last_review: date,
  };
}

function progress(wordId: string, updatedAt = "2026-09-20T00:00:00.000Z", overrides: Record<string, unknown> = {}) {
  return {
    _id: `p-${wordId}`,
    userId,
    wordId,
    bookId: "book-a",
    lessonId: "lesson-a",
    status: "learning",
    firstSeenAt: "2026-09-19T00:00:00.000Z",
    lastReviewedAt: "2026-09-19T00:00:00.000Z",
    nextReviewAt: "2026-09-20T00:00:00.000Z",
    reviewCount: 1,
    lapseCount: 0,
    card: cardPayload(),
    isDifficult: false,
    isIgnored: false,
    updatedAt,
    version: 1,
    ...overrides,
  };
}

function event(id: string, reviewedAt: string, wordId = knownWord.id) {
  return {
    _id: id,
    userId,
    wordId,
    reviewedAt,
    rating: 3,
    responseTime: 1200,
    studyMode: "review",
    clientCreatedAt: reviewedAt,
  };
}

function pull(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    userId,
    progress: [progress(knownWord.id)],
    events: [],
    serverTime: "2026-09-22T00:00:00.000Z",
    ...overrides,
  };
}

function localData(): Data {
  const state = initialState(knownWord.id, new Date("2026-09-18T00:00:00.000Z"), userId);
  state.status = "learning";
  state.firstSeenAt = "2026-09-18T00:00:00.000Z";
  state.updatedAt = "2026-09-18T00:00:00.000Z";
  return {
    books: [{ id: "book-a", title: "A", description: "", language: "ja", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
    lessons: [{ id: "lesson-a", bookId: "book-a", title: "第1课", order: 1 }],
    words: [knownWord],
    states: [state],
    logs: [],
    currentBookId: "book-a",
    currentBookIdSource: "user",
    currentBookIdUpdatedAt: "2026-09-18T00:00:00.000Z",
    seeded: true,
  };
}

describe("mini program sync payload and deterministic reconciliation", () => {
  it("rejects mismatched identities, malformed cards, and invalid ratings", () => {
    expect(() => validateSyncPull({ ...pull(), userId: "another-user" }, userId)).toThrow(/userId/);
    expect(() => validateSyncPull({ ...pull(), progress: [progress(knownWord.id, undefined, { card: { ...cardPayload(), due: "bad" } })] }, userId)).toThrow(/card.due/);
    expect(() => validateSyncPull({ ...pull(), events: [event("bad-rating", "2026-09-20T00:00:00.000Z")] .map((item) => ({ ...item, rating: 5 })) }, userId)).toThrow(/rating/);
    expect(() => validateSyncPull({ ...pull(), settings: { userId: "another-user", updatedAt: "2026-09-22T00:00:00.000Z" } }, userId)).toThrow(/settings.userId/);
  });

  it("deduplicates and stably orders cloud events, materializing complete ReviewLog snapshots", () => {
    const validated = validateSyncPull(pull({ events: [event("e2", "2026-09-21T00:00:00.000Z"), event("e1", "2026-09-20T00:00:00.000Z"), event("e1", "2026-09-20T00:00:00.000Z")] }), userId);
    const result = reconcileMiniProgramData(localData(), validated);

    expect(result.logs.map((log) => log.id)).toEqual(["e1", "e2"]);
    for (const log of result.logs) {
      expect(log.previousState.card.due).toBeInstanceOf(Date);
      expect(log.newState.card.due).toBeInstanceOf(Date);
      expect(log.previousState.wordId).toBe(knownWord.id);
      expect(log.newState.wordId).toBe(knownWord.id);
    }
  });

  it("includes queued events, preserves unknown cloud words, and uses stable input timestamps", () => {
    const unknownId = "future-book-w-999";
    const validated = validateSyncPull(pull({
      progress: [progress(knownWord.id, "2026-09-21T00:00:00.000Z"), progress(unknownId)],
      events: [event("cloud-event", "2026-09-21T00:00:00.000Z")],
    }), userId);
    const queue: SyncQueueItem[] = [{
      id: "queue-event",
      type: "review_event",
      createdAt: "2026-09-21T00:00:00.000Z",
      retries: 0,
      payload: event("queued-event", "2026-09-20T12:00:00.000Z"),
    }];
    const first = reconcileMiniProgramData(localData(), validated, queue);
    const second = reconcileMiniProgramData(localData(), validated, queue);

    expect(first.states.some((state) => state.wordId === unknownId)).toBe(true);
    expect(first.logs.map((log) => log.id)).toEqual(["queued-event", "cloud-event"]);
    expect(first.states.find((state) => state.wordId === knownWord.id)?.updatedAt).toBe("2026-09-21T00:00:00.000Z");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("does not let a remote default setting replace a local user choice", () => {
    const validated = validateSyncPull(pull({
      settings: {
        userId,
        currentBookId: "book-default",
        currentBookIdSource: "default",
        updatedAt: "2026-09-22T00:00:00.000Z",
      },
    }), userId) as ValidatedSyncPull;
    const result = reconcileMiniProgramData(localData(), validated);

    expect(result.currentBookId).toBe("book-a");
    expect(result.currentBookIdSource).toBe("user");
  });

  it("does not let a source-less legacy cloud setting replace a local user choice", () => {
    const validated = validateSyncPull(pull({
      settings: { userId, currentBookId: "legacy-cloud-book", updatedAt: "2026-09-22T00:00:00.000Z" },
    }), userId);
    const result = reconcileMiniProgramData(localData(), validated);
    expect(result.currentBookId).toBe("book-a");
    expect(result.currentBookIdSource).toBe("user");
  });

  it("resolves conflicting duplicate event ids independently of payload order", () => {
    const low = { ...event("same", "2026-09-20T00:00:00.000Z"), rating: 1 };
    const high = { ...event("same", "2026-09-20T00:00:00.000Z"), rating: 4 };
    const first = reconcileMiniProgramData(localData(), validateSyncPull(pull({ events: [low, high] }), userId));
    const second = reconcileMiniProgramData(localData(), validateSyncPull(pull({ events: [high, low] }), userId));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("restores newer cloud progress even when migrated history has no events", () => {
    const source = localData();
    const validated = validateSyncPull(pull({
      events: [],
      progress: [progress(knownWord.id, "2026-09-21T00:00:00.000Z", {
        reviewCount: 7,
        status: "review",
        card: { ...cardPayload("2026-10-01T00:00:00.000Z"), reps: 7, state: 2 },
      })],
    }), userId);
    const result = reconcileMiniProgramData(source, validated);
    expect(result.states[0]).toMatchObject({ reviewCount: 7, status: "review", updatedAt: "2026-09-21T00:00:00.000Z" });
  });

  it("keeps newer local preferences while accepting an older valid pull", () => {
    const source = localData();
    source.userSettings = { userId, preferences: { pronunciationVoice: "male" }, updatedAt: "2026-09-22T00:00:00.000Z" };
    const validated = validateSyncPull(pull({
      settings: { userId, preferences: { pronunciationVoice: "female" }, updatedAt: "2026-09-20T00:00:00.000Z" },
    }), userId);
    const result = reconcileMiniProgramData(source, validated);
    expect(result.userSettings?.preferences?.pronunciationVoice).toBe("male");
  });
});

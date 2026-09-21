import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluate, initialState } from "@jp/core";
import { Rating } from "ts-fsrs";
import { ensureStudyRuntime } from "../apps/miniprogram/src/adapters/runtime";

describe("mini-program runtime compatibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the native structuredClone implementation when available", () => {
    const native = vi.fn((value: unknown) => value);
    vi.stubGlobal("structuredClone", native);
    ensureStudyRuntime();
    expect(globalThis.structuredClone).toBe(native);
  });

  it("clones FSRS state with dates, arrays, and cycles when native clone is absent", () => {
    vi.stubGlobal("structuredClone", undefined);
    ensureStudyRuntime();
    const reviewedAt = new Date("2026-09-21T00:00:00.000Z");
    const source: any = { reviewedAt, values: [1, { ok: true }] };
    source.self = source;
    const copy = globalThis.structuredClone(source);

    expect(copy).not.toBe(source);
    expect(copy.reviewedAt).toEqual(reviewedAt);
    expect(copy.reviewedAt).not.toBe(reviewedAt);
    expect(copy.values).not.toBe(source.values);
    expect(copy.self).toBe(copy);
  });

  it("allows @jp/core evaluate to run without native structuredClone", () => {
    vi.stubGlobal("structuredClone", undefined);
    ensureStudyRuntime();
    const previous = initialState("runtime-word");
    const result = evaluate(previous, Rating.Good, "new", new Date("2026-09-21T00:00:00.000Z"), "runtime-log");
    expect(result.log.previousState).toEqual(previous);
    expect(result.log.previousState).not.toBe(previous);
    expect(result.log.previousState.card).not.toBe(previous.card);
  });

  it("throws for unsupported values instead of silently dropping them", () => {
    vi.stubGlobal("structuredClone", undefined);
    ensureStudyRuntime();
    expect(() => globalThis.structuredClone(() => undefined)).toThrow(TypeError);
    expect(() => globalThis.structuredClone(new Map())).toThrow(TypeError);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createMiniAutoPronunciationPreference,
  createMiniStudyAutoPronunciationGate,
  MINI_AUTO_PRONUNCIATION_KEY,
  shouldAutoPronounceAfterReveal,
  shouldAutoPronounceOnEntry,
} from "../apps/miniprogram/src/services/auto-pronunciation-preference";

describe("Mini Program automatic pronunciation preference", () => {
  it("defaults to enabled and restores a device-local choice", async () => {
    const storage = { getItem: vi.fn(async () => "0"), setItem: vi.fn(async () => {}) };
    const preference = createMiniAutoPronunciationPreference(storage);

    expect(preference.state.enabled).toBe(true);
    await preference.load();
    expect(preference.state.enabled).toBe(false);
    expect(storage.getItem).toHaveBeenCalledWith(MINI_AUTO_PRONUNCIATION_KEY);
    await preference.setEnabled(true);
    expect(storage.setItem).toHaveBeenCalledWith(MINI_AUTO_PRONUNCIATION_KEY, "1");
    expect(preference.state.enabled).toBe(true);
  });

  it("keeps the default enabled if local storage cannot be read", async () => {
    const preference = createMiniAutoPronunciationPreference({
      getItem: async () => { throw new Error("unavailable"); },
      setItem: async () => {},
    });
    await preference.load();
    expect(preference.state.enabled).toBe(true);
    expect(preference.state.ready).toBe(true);
  });

  it("deduplicates by account and word until the next study session", () => {
    const gate = createMiniStudyAutoPronunciationGate();
    expect(gate.claim("guest", "word-1")).toBe(true);
    expect(gate.claim("guest", "word-1")).toBe(false);
    expect(gate.claim("account-1", "word-1")).toBe(true);
    expect(gate.claim("guest", "word-2")).toBe(true);
    gate.reset();
    expect(gate.claim("guest", "word-1")).toBe(true);
  });

  it("plays eligible questions on entry and waits until reveal for reading and input practice", () => {
    expect(shouldAutoPronounceOnEntry("card")).toBe(true);
    expect(shouldAutoPronounceOnEntry("kana-meaning", "kana-meaning")).toBe(true);
    expect(shouldAutoPronounceOnEntry("audio-meaning", "audio-meaning")).toBe(true);
    expect(shouldAutoPronounceOnEntry("dictation", undefined, "dictation")).toBe(true);
    expect(shouldAutoPronounceOnEntry("kanji-reading", "kanji-reading")).toBe(false);
    expect(shouldAutoPronounceOnEntry("kana-input", undefined, "kana-input")).toBe(false);
    expect(shouldAutoPronounceOnEntry("cloze")).toBe(false);
    expect(shouldAutoPronounceAfterReveal("kanji-reading", "kanji-reading")).toBe(true);
    expect(shouldAutoPronounceAfterReveal("kana-input", undefined, "kana-input")).toBe(true);
    expect(shouldAutoPronounceAfterReveal("cloze")).toBe(true);
    expect(shouldAutoPronounceAfterReveal("audio-meaning", "audio-meaning")).toBe(false);
  });
});

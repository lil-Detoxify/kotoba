import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import seedData from "../apps/miniprogram/src/seed.json";
import { getWordAudioFallbackUrl, getWordAudioUrl } from "../apps/miniprogram/src/adapters/audio-url";

const paramsVersion = "google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0";

function expected(term: string, reading: string, voice: "female" | "male"): string {
  const voiceName = voice === "male" ? "ja-JP-Wavenet-C" : "ja-JP-Wavenet-A";
  const payload = JSON.stringify({ term, reading, voice: voiceName, paramsVersion });
  const hash = createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex");
  return `https://kotobud.com/audio/google/v1/${voice === "male" ? "c" : "a"}/${hash}.mp3`;
}

describe("mini-program audio URL", () => {
  it("matches Node SHA-256 for every bundled seed word and both voices", () => {
    for (const word of seedData.words) {
      expect(getWordAudioUrl(word, "female")).toBe(expected(word.term, word.reading, "female"));
      expect(getWordAudioUrl(word, "male")).toBe(expected(word.term, word.reading, "male"));
    }
  });

  it("handles Unicode, long strings, and rawTerm compatibility", () => {
    const longTerm = "語彙😀".repeat(500);
    const word = { term: "アメリカ人", rawTerm: "～人", reading: "アメリカじん" };
    expect(getWordAudioUrl(word)).toBe(expected("～人", word.reading, "female"));
    expect(getWordAudioUrl({ term: longTerm, reading: "にほんご😀" })).toBe(expected(longTerm, "にほんご😀", "female"));
  });

  it("accepts safe root-relative audio and rejects unsafe or foreign URLs", () => {
    expect(getWordAudioUrl({ term: "x", reading: "x", audioUrl: "/audio/1.mp3" })).toBe("https://kotobud.com/audio/1.mp3");
    expect(getWordAudioUrl({ term: "x", reading: "x", audioUrl: "https://kotobud.com/audio/1.mp3" })).toBe("https://kotobud.com/audio/1.mp3");
    expect(getWordAudioUrl({ term: "x", reading: "x", audioUrl: "javascript:alert(1)" })).toBeUndefined();
    expect(getWordAudioUrl({ term: "x", reading: "x", audioUrl: "https://evil.example/audio.mp3" })).toBeUndefined();
  });

  it("resolves the bundled legacy audio map before generated Google audio", () => {
    expect(getWordAudioFallbackUrl({ term: "私", reading: "わたし" })).toBe("https://kotobud.com/audio/0.mp3");
    expect(getWordAudioFallbackUrl({ term: "学生", reading: "がくせい" })).toBe("https://kotobud.com/audio/1.mp3");
    expect(getWordAudioFallbackUrl({ term: "unknown", reading: "しらない" })).toBeUndefined();
    expect(getWordAudioFallbackUrl({ term: "私", reading: "わたし", audioUrl: "/audio/custom.mp3" })).toBeUndefined();
  });
});

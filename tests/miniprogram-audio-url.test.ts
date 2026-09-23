import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import seedData from "../apps/miniprogram/src/seed.json";
import { AUDIO_VOICE_OPTIONS, getCloudflareAudioUrl, getWordAudioFallbackUrl, getWordAudioUrl, rebaseAudioUrl } from "../apps/miniprogram/src/adapters/audio-url";
import { MINIPROGRAM_AUDIO_ASSET_BASE_URL } from "../apps/miniprogram/src/adapters/asset-url";

const paramsVersion = "google-wavenet-v1-ssml-yomigana-rate1-pitch0-volume0";

function expected(term: string, reading: string, voice: "female" | "male"): string {
  const voiceName = voice === "male" ? "ja-JP-Wavenet-C" : "ja-JP-Wavenet-A";
  const payload = JSON.stringify({ term, reading, voice: voiceName, paramsVersion });
  const hash = createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex");
  return `${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/google/v1/${voice === "male" ? "c" : "a"}/${hash}.mp3`;
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

  it("honors the selected WaveNet voice before a safe book-supplied fallback", () => {
    const word = { term: "x", reading: "x", audioUrl: "/audio/1.mp3" };
    expect(getWordAudioUrl(word, "female")).toBe(expected("x", "x", "female"));
    expect(getWordAudioUrl(word, "male")).toBe(expected("x", "x", "male"));
    expect(getWordAudioFallbackUrl(word)).toBe(`${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/1.mp3`);
    expect(getWordAudioFallbackUrl({ ...word, audioUrl: "javascript:alert(1)" })).toBeUndefined();
    expect(getWordAudioFallbackUrl({ ...word, audioUrl: "https://evil.example/audio.mp3" })).toBeUndefined();
    expect(rebaseAudioUrl("/audio/../other.mp3")).toBeUndefined();
    expect(rebaseAudioUrl("/audio/1.mp3?token=secret")).toBeUndefined();
  });

  it("resolves the bundled legacy audio map for the final fallback", () => {
    expect(getWordAudioFallbackUrl({ term: "私", reading: "わたし" })).toBe(`${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/0.mp3`);
    expect(getWordAudioFallbackUrl({ term: "学生", reading: "がくせい" })).toBe(`${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/1.mp3`);
    expect(getWordAudioFallbackUrl({ term: "unknown", reading: "しらない" })).toBeUndefined();
    expect(getWordAudioFallbackUrl({ term: "私", reading: "わたし", audioUrl: "/audio/custom.mp3" })).toBe(`${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/custom.mp3`);
  });

  it("rebases saved Cloudflare audio URLs onto a future COS origin", () => {
    const cos = "https://kotobud-assets-1234567890.cos.ap-beijing.myqcloud.com";
    expect(rebaseAudioUrl("https://kotobud.com/audio/google/v1/a/hash.mp3", cos))
      .toBe(`${cos}/audio/google/v1/a/hash.mp3`);
    expect(rebaseAudioUrl("/audio/1.mp3", cos)).toBe(`${cos}/audio/1.mp3`);
    expect(rebaseAudioUrl("https://evil.example/audio/1.mp3", cos)).toBeUndefined();
  });

  it("keeps Web voice IDs/labels and builds a same-path Cloudflare fallback", () => {
    expect(AUDIO_VOICE_OPTIONS.map(({ value, label }) => [value, label])).toEqual([["female", "女声 · A"], ["male", "男声 · C"]]);
    expect(getCloudflareAudioUrl("https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com/audio/1.mp3"))
      .toBe("https://kotobud.com/audio/1.mp3");
    expect(getCloudflareAudioUrl("https://evil.example/audio/1.mp3")).toBeUndefined();
  });

  it("keeps Cloudflare fallback when an explicit HTTPS audio origin is configured", async () => {
    vi.stubEnv("VITE_MINIPROGRAM_AUDIO_ASSET_BASE_URL", "https://audio.example.test");
    vi.resetModules();
    try {
      const { getCloudflareAudioUrl: fallback } = await import("../apps/miniprogram/src/adapters/audio-url");
      expect(fallback("https://audio.example.test/audio/google/v1/a/hash.mp3"))
        .toBe("https://kotobud.com/audio/google/v1/a/hash.mp3");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

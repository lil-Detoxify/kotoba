import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getWordAudioUrl } from "../apps/miniprogram/src/adapters/audio-url";
import { MINIPROGRAM_AUDIO_ASSET_BASE_URL } from "../apps/miniprogram/src/adapters/asset-url";
import { textbookCatalog } from "../apps/miniprogram/src/services/textbooks";

type BookWord = { term: string; reading: string; rawTerm?: string; audioTerm?: string };
type AudioEntry = { term: string; reading: string; female: string; male: string };

const webRoot = join(process.cwd(), "apps", "web", "public");
const audioMap = JSON.parse(readFileSync(join(process.cwd(), "apps", "web", "src", "google-audio-map.json"), "utf8")) as {
  entries: AudioEntry[];
};

function wordsForBook(bookId: string): BookWord[] {
  const payload = JSON.parse(readFileSync(join(webRoot, "data", "books", `${bookId}.json`), "utf8")) as {
    lessons: Array<{ words: BookWord[] }>;
  };
  return payload.lessons.flatMap((lesson) => lesson.words);
}

function sourceKey(word: BookWord): string {
  return `${word.audioTerm || word.rawTerm || word.term}|${word.reading}`;
}

function localMp3Files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return localMp3Files(path);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".mp3") ? [path] : [];
  });
}

describe("mini-program textbook audio catalog", () => {
  it("resolves both CDN voices for all eleven official books without bundling MP3 files", () => {
    const officialIds = textbookCatalog.map((book) => book.id);
    const entriesByKey = new Map(audioMap.entries.map((entry) => [`${entry.term}|${entry.reading}`, entry]));
    const missing: string[] = [];
    const legacyKeys = new Set<string>();
    let wordCount = 0;

    expect(officialIds).toEqual([
      "biaori-beginner-upper", "biaori-beginner-lower", "biaori-intermediate-upper",
      "biaori-intermediate-lower", "biaori-advanced-upper", "biaori-advanced-lower",
      "jlpt-n5", "jlpt-n4", "jlpt-n3", "jlpt-n2", "jlpt-n1",
    ]);
    expect(audioMap.entries).toHaveLength(13_412);

    for (const bookId of officialIds) {
      const words = wordsForBook(bookId);
      wordCount += words.length;
      for (const word of words) {
        const key = sourceKey(word);
        const entry = entriesByKey.get(key);
        if (!entry) {
          missing.push(`${bookId}:${key}`);
          continue;
        }
        if (bookId.startsWith("biaori-")) legacyKeys.add(key);
        for (const voice of ["female", "male"] as const) {
          const url = getWordAudioUrl(word, voice);
          const expectedPath = entry[voice];
          if (url !== `${MINIPROGRAM_AUDIO_ASSET_BASE_URL}${expectedPath}`
            || !existsSync(join(webRoot, new URL(url || "https://invalid.local").pathname))) {
            missing.push(`${bookId}:${word.term}:${voice}`);
          }
        }
      }
    }

    const legacyRows = [...legacyKeys]
      .map((key) => entriesByKey.get(key)!)
      .map((entry) => [entry.term, entry.reading, entry.female, entry.male].join("|"))
      .sort()
      .join("\n");
    const legacyHash = createHash("sha256").update(legacyRows).digest("hex");

    expect(wordCount).toBe(16_926);
    expect(missing).toEqual([]);
    expect(legacyKeys).toHaveLength(9_036);
    expect(legacyHash).toBe("5bcc5a1681ab0b4f58d3e418c8c245a763df133d983773e76dc19f822722c462");
    expect(localMp3Files(join(process.cwd(), "apps", "miniprogram", "src"))).toEqual([]);
  }, 30_000);
});

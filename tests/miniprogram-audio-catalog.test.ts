import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getWordAudioUrl } from "../apps/miniprogram/src/adapters/audio-url";
import { MINIPROGRAM_AUDIO_ASSET_BASE_URL } from "../apps/miniprogram/src/adapters/asset-url";

describe("six-book mini-program audio coverage", () => {
  it("has the selected female and male audio object for every textbook word", () => {
    const root = join(process.cwd(), "apps", "web", "public");
    const books = readdirSync(join(root, "data", "books"))
      .filter((name) => /^biaori-.*\.json$/.test(name));
    const missing: string[] = [];
    let wordCount = 0;
    for (const book of books) {
      const payload = JSON.parse(readFileSync(join(root, "data", "books", book), "utf8")) as {
        lessons: Array<{ words: Array<{ term: string; reading: string; rawTerm?: string; audioTerm?: string }> }>;
      };
      for (const lesson of payload.lessons) for (const word of lesson.words) {
        wordCount++;
        for (const voice of ["female", "male"] as const) {
          const url = getWordAudioUrl(word, voice);
          if (!url?.startsWith(`${MINIPROGRAM_AUDIO_ASSET_BASE_URL}/audio/`)
            || !existsSync(join(root, new URL(url).pathname))) missing.push(`${book}:${word.term}:${voice}`);
        }
      }
    }
    expect(books).toHaveLength(6);
    expect(wordCount).toBe(9_117);
    expect(missing).toEqual([]);
  }, 30_000);
});

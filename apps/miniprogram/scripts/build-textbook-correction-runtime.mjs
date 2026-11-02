import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(scriptDir, "../../web/src/textbook-corrections.json");
const outputPath = path.resolve(scriptDir, "../src/services/textbook-corrections-runtime.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

if (typeof source.version !== "string" || !Array.isArray(source.entries)) {
  throw new Error("Web textbook corrections catalog has an invalid shape.");
}

const entries = source.entries.map((entry) => {
  if (typeof entry.wordId !== "string" || typeof entry.bookId !== "string"
      || !Number.isSafeInteger(entry.lessonOrder) || typeof entry.previous?.term !== "string"
      || !entry.corrected || typeof entry.corrected !== "object" || Array.isArray(entry.corrected)) {
    throw new Error("Web textbook corrections catalog contains an invalid entry.");
  }
  return {
    wordId: entry.wordId,
    bookId: entry.bookId,
    lessonOrder: entry.lessonOrder,
    previous: { term: entry.previous.term },
    corrected: entry.corrected,
  };
});

const wordIds = new Set(entries.map((entry) => entry.wordId));
if (wordIds.size !== entries.length) throw new Error("Web textbook corrections catalog contains duplicate word IDs.");

await writeFile(outputPath, `${JSON.stringify({ version: source.version, entries }, null, 2)}\n`, "utf8");
console.log(`Generated ${entries.length} Mini runtime corrections (${path.relative(scriptDir, outputPath)}).`);

import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "../../..");
const publicRoot = path.join(repoRoot, "apps/web/public");
const catalogPath = path.join(repoRoot, "apps/miniprogram/src/services/textbooks-catalog.json");

const BOOK_CACHE_CONTROL = "public, max-age=300, s-maxage=3600, must-revalidate";
const HASH_AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable";
const LEGACY_AUDIO_CACHE_CONTROL = "public, max-age=86400";

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function entry(localPath, key, contentType, cacheControl) {
  const stats = await fs.stat(localPath);
  return {
    localPath,
    key: key.replaceAll("\\", "/"),
    size: stats.size,
    sha256: await sha256(localPath),
    contentType,
    cacheControl,
  };
}

async function mp3Files(directory) {
  const names = await fs.readdir(directory);
  return names.filter((name) => name.endsWith(".mp3")).sort();
}

async function buildBookEntries() {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog.books) || catalog.books.length !== 6) throw new Error("教材目录必须包含 6 册");
  const lessons = catalog.books.reduce((sum, book) => sum + book.lessons.length, 0);
  const words = catalog.books.reduce((sum, book) => sum + book.wordCount, 0);
  if (lessons !== 104 || words !== 9117) throw new Error("教材目录统计不符合 6 册、104 课、9,117 词基线");

  const bookDir = path.join(publicRoot, "data/books");
  const definitions = ["index", ...catalog.books.map((book) => book.id)];
  const result = [];
  for (const name of definitions) {
    const localPath = path.join(bookDir, `${name}.json`);
    if (name !== "index") {
      const payload = JSON.parse(await fs.readFile(localPath, "utf8"));
      const definition = catalog.books.find((book) => book.id === name);
      const sourceIndexes = payload.lessons?.flatMap((lesson) => lesson.words?.map((word) => word.sourceIndex) ?? []) ?? [];
      if (payload.id !== name || payload.wordCount !== definition.wordCount || payload.lessons?.length !== definition.lessons.length
          || sourceIndexes.length !== definition.wordCount || new Set(sourceIndexes).size !== sourceIndexes.length) {
        throw new Error(`教材源文件校验失败: ${name}`);
      }
    }
    result.push(await entry(localPath, `data/books/${name}.json`, "application/json; charset=utf-8", BOOK_CACHE_CONTROL));
  }
  return result;
}

async function buildAudioEntries() {
  const result = [];
  for (const voice of ["a", "c"]) {
    const directory = path.join(publicRoot, "audio/google/v1", voice);
    for (const name of await mp3Files(directory)) {
      result.push(await entry(path.join(directory, name), `audio/google/v1/${voice}/${name}`, "audio/mpeg", HASH_AUDIO_CACHE_CONTROL));
    }
  }
  const legacyDir = path.join(publicRoot, "audio");
  for (const name of await mp3Files(legacyDir)) {
    result.push(await entry(path.join(legacyDir, name), `audio/${name}`, "audio/mpeg", LEGACY_AUDIO_CACHE_CONTROL));
  }
  return result;
}

export async function buildManifest(scope = "books") {
  if (!["books", "audio", "all"].includes(scope)) throw new Error(`不支持的资源范围: ${scope}`);
  const entries = [];
  if (scope !== "audio") entries.push(...await buildBookEntries());
  if (scope !== "books") entries.push(...await buildAudioEntries());
  entries.sort((left, right) => left.key.localeCompare(right.key));
  return {
    version: 1,
    scope,
    generatedAt: new Date().toISOString(),
    objectCount: entries.length,
    totalBytes: entries.reduce((sum, item) => sum + item.size, 0),
    entries,
  };
}

export async function writeManifest(manifest) {
  const outputDir = path.join(repoRoot, ".cache/miniprogram-cos");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${manifest.scope}-manifest.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return outputPath;
}

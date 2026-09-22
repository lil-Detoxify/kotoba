import { describe, expect, it } from "vitest";
import { buildManifest } from "../apps/miniprogram/scripts/cos-asset-manifest.mjs";

const expectedHashes: Record<string, string> = {
  "data/books/biaori-advanced-lower.json": "ffd42f4b28cf337f5892a0439fe6f28fb26ccbdd91c876915637bc787d4c1cd3",
  "data/books/biaori-advanced-upper.json": "46e76474d43c35045bf1fc2690017aebb122a2639934bacc5670623d1806a4f2",
  "data/books/biaori-beginner-lower.json": "9becf8d1972a69a8a9fe348351623aa93edfb9fcfcee6ed658764c8ec5ec1dea",
  "data/books/biaori-beginner-upper.json": "aac035efef8c7ad2ad541e31dfead377b138a6d485730bb6e08058adb0f464d4",
  "data/books/biaori-intermediate-lower.json": "b699d4034c5be15af247e9c5a315d8da3494e5737127004c2331f466b82d0013",
  "data/books/biaori-intermediate-upper.json": "57e2ac9b279774d7cab03d21a20130cbeefce74ba4ac8969929e862bade1f2dc",
  "data/books/index.json": "464c5c1c04cff9a398918d59132f42268d85f40539221b09057998918e2e00fc",
};

describe("mini-program COS textbook manifest", () => {
  it("produces the complete immutable local baseline before upload", async () => {
    const manifest = await buildManifest("books");
    expect(manifest.objectCount).toBe(7);
    expect(manifest.totalBytes).toBe(1_277_712);
    expect(Object.fromEntries(manifest.entries.map((entry) => [entry.key, entry.sha256]))).toEqual(expectedHashes);
    expect(manifest.entries.every((entry) => entry.contentType === "application/json; charset=utf-8")).toBe(true);
    expect(manifest.entries.every((entry) => entry.cacheControl.includes("must-revalidate"))).toBe(true);
  });

  it("rejects an unknown publishing scope", async () => {
    await expect(buildManifest("unknown")).rejects.toThrow("不支持的资源范围");
  });

  it("captures every staged audio object without changing its key", async () => {
    const manifest = await buildManifest("audio");
    expect(manifest.objectCount).toBe(18_122);
    expect(manifest.totalBytes).toBe(139_208_304);
    expect(manifest.entries.filter((entry) => entry.key.startsWith("audio/google/v1/a/"))).toHaveLength(9_036);
    expect(manifest.entries.filter((entry) => entry.key.startsWith("audio/google/v1/c/"))).toHaveLength(9_036);
    expect(manifest.entries.filter((entry) => /^audio\/\d+\.mp3$/.test(entry.key))).toHaveLength(50);
    expect(manifest.entries.every((entry) => entry.contentType === "audio/mpeg")).toBe(true);
  }, 30_000);
});

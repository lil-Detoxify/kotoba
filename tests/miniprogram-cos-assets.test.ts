import { describe, expect, it } from "vitest";
import { buildManifest } from "../apps/miniprogram/scripts/cos-asset-manifest.mjs";

const expectedHashes: Record<string, string> = {
  "data/books/biaori-advanced-lower.json": "ffd42f4b28cf337f5892a0439fe6f28fb26ccbdd91c876915637bc787d4c1cd3",
  "data/books/biaori-advanced-upper.json": "46e76474d43c35045bf1fc2690017aebb122a2639934bacc5670623d1806a4f2",
  "data/books/biaori-beginner-lower.json": "9becf8d1972a69a8a9fe348351623aa93edfb9fcfcee6ed658764c8ec5ec1dea",
  "data/books/biaori-beginner-upper.json": "aac035efef8c7ad2ad541e31dfead377b138a6d485730bb6e08058adb0f464d4",
  "data/books/biaori-intermediate-lower.json": "b699d4034c5be15af247e9c5a315d8da3494e5737127004c2331f466b82d0013",
  "data/books/biaori-intermediate-upper.json": "57e2ac9b279774d7cab03d21a20130cbeefce74ba4ac8969929e862bade1f2dc",
  "data/books/index.json": "0715be39d3aab195709bffd6443692125c673ef863970a3e0a7be26588e0d689",
  "data/books/jlpt-n5.json": "537fe4548b1ad1b026496ea31027f24899a91b65fe753b12d253ee95dd22e6af",
  "data/books/jlpt-n4.json": "ccfad3fc94833fc591adf3447abec3edc56c153bbb790bcb0849488d5ba0c598",
  "data/books/jlpt-n3.json": "34ee6e312b45848c10272647aa6ffe1c896d5cc20602c1c504e36cba1a11226d",
  "data/books/jlpt-n2.json": "909c9fc683272589da3f0641538c155ca1afd8c02bc52ba979a7742ec7a204db",
  "data/books/jlpt-n1.json": "e4ffd29284a45cb4fb197b14c9d185b33a39463d1ecdf365028c8ef09b4c859a",
};

describe("mini-program COS textbook manifest", () => {
  it("produces the complete immutable local baseline before upload", async () => {
    const manifest = await buildManifest("books");
    expect(manifest.objectCount).toBe(12);
    expect(manifest.totalBytes).toBe(2_484_081);
    expect(Object.fromEntries(manifest.entries.map((entry) => [entry.key, entry.sha256]))).toEqual(expectedHashes);
    expect(manifest.entries.every((entry) => entry.contentType === "application/json; charset=utf-8")).toBe(true);
    expect(manifest.entries.every((entry) => entry.cacheControl.includes("must-revalidate"))).toBe(true);
  });

  it("rejects an unknown publishing scope", async () => {
    await expect(buildManifest("unknown")).rejects.toThrow("不支持的资源范围");
  });

  it("captures every staged audio object without changing its key", async () => {
    const manifest = await buildManifest("audio");
    expect(manifest.objectCount).toBe(26_874);
    expect(manifest.totalBytes).toBe(198_505_392);
    expect(manifest.entries.filter((entry) => entry.key.startsWith("audio/google/v1/a/"))).toHaveLength(13_412);
    expect(manifest.entries.filter((entry) => entry.key.startsWith("audio/google/v1/c/"))).toHaveLength(13_412);
    expect(manifest.entries.filter((entry) => /^audio\/\d+\.mp3$/.test(entry.key))).toHaveLength(50);
    expect(manifest.entries.every((entry) => entry.contentType === "audio/mpeg")).toBe(true);
  }, 30_000);
});

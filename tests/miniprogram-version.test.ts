import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mini-program release metadata", () => {
  it("keeps Mini metadata in sync while Web follows the product release", () => {
    const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
    const product = read("package.json");
    const web = read("apps/web/package.json");
    const mini = read("apps/miniprogram/package.json");
    const manifest = read("apps/miniprogram/src/manifest.json");
    const lock = read("package-lock.json");

    expect(web.version).toBe(product.version);
    expect(lock.packages[""].version).toBe(product.version);
    expect(lock.packages["apps/web"].version).toBe(web.version);
    expect(manifest.versionName).toBe(mini.version);
    expect(lock.packages["apps/miniprogram"].version).toBe(mini.version);
    expect(Number(manifest.versionCode)).toBeGreaterThanOrEqual(73);
  });
});

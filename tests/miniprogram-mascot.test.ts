import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUDY_MASCOT_VISIBLE,
  clampStudyMascotPosition,
  DEFAULT_STUDY_MASCOT_POSITION,
  getStudyMascotAsset,
  movedBeforeMascotLongPress,
  readStudyMascotPosition,
  readStudyMascotVisibility,
  STUDY_MASCOT_ASSETS,
  STUDY_MASCOT_POSITION_KEY,
  STUDY_MASCOT_VISIBILITY_KEY,
  translateStudyMascotPosition,
  writeStudyMascotPosition,
  writeStudyMascotVisibility,
} from "../apps/miniprogram/src/services/mascot";

class MemoryStorage {
  values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.values.set(key, value); }
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function decodeRgbaPng(png: Buffer): { width: number; height: number; pixels: Buffer } {
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  for (let offset = 8; offset < png.length;) {
    const length = readUInt32BE(png, offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = readUInt32BE(png, dataStart);
      height = readUInt32BE(png, dataStart + 4);
      bitDepth = png[dataStart + 8];
      colorType = png[dataStart + 9];
      interlace = png[dataStart + 12];
    } else if (type === "IDAT") {
      chunks.push(png.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) throw new Error("Expected a non-interlaced 8-bit RGBA PNG");

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(chunks));
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = y * (stride + 1);
    const destinationRow = y * stride;
    const filter = inflated[sourceRow];
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceRow + 1 + x];
      const left = x >= bytesPerPixel ? pixels[destinationRow + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[destinationRow + x - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[destinationRow + x - stride - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      if (filter === 2) predictor = above;
      if (filter === 3) predictor = Math.floor((left + above) / 2);
      if (filter === 4) {
        const estimate = left + above - upperLeft;
        const leftDistance = Math.abs(estimate - left);
        const aboveDistance = Math.abs(estimate - above);
        const upperLeftDistance = Math.abs(estimate - upperLeft);
        predictor = leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
          ? left
          : aboveDistance <= upperLeftDistance ? above : upperLeft;
      }
      pixels[destinationRow + x] = (raw + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

describe("mini-program mascot", () => {
  it("renders the pose-specific local PNG selected through a dynamic source", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/components/StudyMascot.vue"), "utf8");

    expect(source).toMatch(/import\s*\{[^}]*\bgetStudyMascotAsset\b[^}]*\}\s*from\s*"\.\.\/services\/mascot"/s);
    expect(source).toMatch(/const\s+asset\s*=\s*computed\(\(\)\s*=>\s*getStudyMascotAsset\(props\.pose\)\)/);
    expect(source).toMatch(/<image\b[^>]*:src="asset"[^>]*mode="scaleToFill"/s);
    expect(source).toContain("width: 100%");
    expect(source).toContain("height: 100%");
    expect(source).not.toContain("300%");
    expect(source).not.toContain("middle-row-top-mask");
    expect(source).not.toContain("backgroundImage:");

    const poses = ["studying", "review", "correct", "wrong", "complete"] as const;
    for (const pose of poses) {
      expect(getStudyMascotAsset(pose)).toBe(`/static/pet/leaf-cat-${pose}-v2.png`);
      const imagePath = resolve(process.cwd(), "apps/miniprogram/src", getStudyMascotAsset(pose).replace(/^\//, ""));
      const png = readFileSync(imagePath);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(readUInt32BE(png, 16)).toBe(418);
      expect(readUInt32BE(png, 20)).toBe(418);
      expect(png[25]).toBe(6); // RGBA color type keeps the extracted frame transparent.
      const decoded = decodeRgbaPng(png);
      const clearRows = { studying: 49, review: 68, correct: 54, wrong: 30, complete: 27 }[pose];
      let hasTopAlpha = false;
      for (let y = 0; y < clearRows; y += 1) {
        for (let x = 0; x < decoded.width; x += 1) {
          if (decoded.pixels[(y * decoded.width + x) * 4 + 3] !== 0) hasTopAlpha = true;
        }
      }
      expect(hasTopAlpha, `${pose} has alpha in cleared top rows`).toBe(false);
    }
    expect(Object.keys(STUDY_MASCOT_ASSETS)).toEqual(poses);
  });

  it("maps the review and reaction poses to their dedicated image files", () => {
    expect(getStudyMascotAsset("review")).toBe("/static/pet/leaf-cat-review-v2.png");
    expect(getStudyMascotAsset("correct")).toBe("/static/pet/leaf-cat-correct-v2.png");
    expect(getStudyMascotAsset("wrong")).toBe("/static/pet/leaf-cat-wrong-v2.png");
  });

  it("defaults to visible until the user saves a visibility preference", async () => {
    const storage = new MemoryStorage();
    expect(await readStudyMascotVisibility(storage)).toBe(DEFAULT_STUDY_MASCOT_VISIBLE);
    expect(DEFAULT_STUDY_MASCOT_VISIBLE).toBe(true);
    await writeStudyMascotVisibility(storage, true);
    expect(storage.values.get(STUDY_MASCOT_VISIBILITY_KEY)).toBe("1");
    expect(await readStudyMascotVisibility(storage)).toBe(true);
    await writeStudyMascotVisibility(storage, false);
    expect(await readStudyMascotVisibility(storage)).toBe(false);
  });

  it("persists a normalized viewport position and clamps movement to visible bounds", async () => {
    const storage = new MemoryStorage();
    expect(await readStudyMascotPosition(storage)).toEqual(DEFAULT_STUDY_MASCOT_POSITION);
    await writeStudyMascotPosition(storage, { x: 2, y: -1 });
    expect(storage.values.get(STUDY_MASCOT_POSITION_KEY)).toBe(JSON.stringify({ x: 1, y: 0 }));

    const bounds = { width: 390, height: 780, mascotWidth: 58, mascotHeight: 58 };
    expect(clampStudyMascotPosition({ x: 1, y: 0 }, bounds)).toEqual({ x: 1 - 29 / 390, y: 29 / 780 });
    expect(translateStudyMascotPosition({ x: 0.5, y: 0.5 }, 10000, -10000, bounds))
      .toEqual({ x: 1 - 29 / 390, y: 29 / 780 });

    const top = translateStudyMascotPosition({ x: 0.5, y: 0.5 }, 0, -10000, bounds);
    const bottom = translateStudyMascotPosition({ x: 0.5, y: 0.5 }, 0, 10000, bounds);
    expect((bottom.y - top.y) * bounds.height).toBeCloseTo(bounds.height - bounds.mascotHeight);
    expect((bottom.y - top.y) * bounds.height).toBeGreaterThan(600);
  });

  it("keeps viewport coordinates stable while a temporary dock only clips overlapping positions", () => {
    const dockBounds = { width: 390, height: 760, visibleHeight: 610, mascotWidth: 58, mascotHeight: 58 };
    const awayFromDock = { x: 0.5, y: 0.5 };
    expect(clampStudyMascotPosition(awayFromDock, dockBounds)).toEqual(awayFromDock);

    const nearDock = { x: 0.5, y: 0.9 };
    const clipped = clampStudyMascotPosition(nearDock, dockBounds);
    expect(clipped.y).toBeLessThan(nearDock.y);
    expect(clipped.y * dockBounds.height + dockBounds.mascotHeight / 2).toBeLessThanOrEqual(dockBounds.visibleHeight!);
    expect(clampStudyMascotPosition(nearDock, { ...dockBounds, visibleHeight: dockBounds.height })).toEqual(nearDock);
  });

  it("only cancels a pending long press after the finger leaves the touch slop", () => {
    expect(movedBeforeMascotLongPress({ x: 10, y: 10 }, { x: 16, y: 16 })).toBe(false);
    expect(movedBeforeMascotLongPress({ x: 10, y: 10 }, { x: 18, y: 17 })).toBe(true);
  });

  it("falls back safely when the saved preference is invalid or storage fails", async () => {
    const storage = new MemoryStorage();
    storage.values.set(STUDY_MASCOT_VISIBILITY_KEY, "maybe");
    expect(await readStudyMascotVisibility(storage)).toBe(DEFAULT_STUDY_MASCOT_VISIBLE);
    expect(await readStudyMascotVisibility({ getItem: async () => { throw new Error("unavailable"); } }))
      .toBe(DEFAULT_STUDY_MASCOT_VISIBLE);
  });

});

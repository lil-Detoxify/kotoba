import type { StorageAdapter } from "../adapters/types";

export type StudyMascotPose = "studying" | "review" | "correct" | "wrong" | "complete";

/** Runtime paths keep mini-program asset loading independent from atlas sampling and template URL rewriting. */
export const STUDY_MASCOT_ASSETS: Record<StudyMascotPose, string> = {
  studying: "/static/pet/leaf-cat-studying-v2.png",
  review: "/static/pet/leaf-cat-review-v2.png",
  correct: "/static/pet/leaf-cat-correct-v2.png",
  wrong: "/static/pet/leaf-cat-wrong-v2.png",
  complete: "/static/pet/leaf-cat-complete-v2.png",
};

export function getStudyMascotAsset(pose: StudyMascotPose): string {
  return STUDY_MASCOT_ASSETS[pose];
}

// This preference is device-local. An explicit saved "0" still hides the mascot.
export const STUDY_MASCOT_VISIBILITY_KEY = "kotobud.miniprogram.mascot.studyVisibility.v1";
export const DEFAULT_STUDY_MASCOT_VISIBLE = true;

export interface StudyMascotPosition {
  /** Normalized center coordinate within the stable safe-area viewport. */
  x: number;
  /** Normalized center coordinate within the stable safe-area viewport. */
  y: number;
}

export interface StudyMascotBounds {
  width: number;
  /** Stable full safe-area viewport height used for stored normalized coordinates. */
  height: number;
  mascotWidth: number;
  mascotHeight: number;
  /** Optional temporary vertical limit, such as space above a fixed quiz action dock. */
  visibleHeight?: number;
}

export const STUDY_MASCOT_POSITION_KEY = "kotobud.miniprogram.mascot.studyPosition.v1";
export const DEFAULT_STUDY_MASCOT_POSITION: StudyMascotPosition = { x: 0.91, y: 0.5 };
export const STUDY_MASCOT_DRAG_SLOP_PX = 10;

function clampUnit(value: number, fallback: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : fallback));
}

export function clampStudyMascotPosition(position: StudyMascotPosition, bounds: StudyMascotBounds): StudyMascotPosition {
  if (bounds.width <= 0 || bounds.height <= 0) return { ...DEFAULT_STUDY_MASCOT_POSITION };
  const halfWidth = Math.max(0, bounds.mascotWidth) / (2 * bounds.width);
  const halfHeight = Math.max(0, bounds.mascotHeight) / (2 * bounds.height);
  const visibleHeight = Math.max(0, Math.min(bounds.height, bounds.visibleHeight ?? bounds.height));
  const visibleCenterMax = Math.max(bounds.mascotHeight / 2, visibleHeight - bounds.mascotHeight / 2);
  const minX = Math.min(0.5, halfWidth);
  const maxX = Math.max(0.5, 1 - halfWidth);
  const minY = Math.min(0.5, halfHeight);
  const maxY = Math.max(minY, Math.min(1 - halfHeight, visibleCenterMax / bounds.height));
  const x = clampUnit(position.x, DEFAULT_STUDY_MASCOT_POSITION.x);
  const y = clampUnit(position.y, DEFAULT_STUDY_MASCOT_POSITION.y);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export function translateStudyMascotPosition(
  position: StudyMascotPosition,
  deltaX: number,
  deltaY: number,
  bounds: StudyMascotBounds,
): StudyMascotPosition {
  if (bounds.width <= 0 || bounds.height <= 0) return clampStudyMascotPosition(position, bounds);
  return clampStudyMascotPosition({
    x: position.x + deltaX / bounds.width,
    y: position.y + deltaY / bounds.height,
  }, bounds);
}

export function movedBeforeMascotLongPress(start: { x: number; y: number }, current: { x: number; y: number }): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > STUDY_MASCOT_DRAG_SLOP_PX;
}

export function parseStudyMascotPosition(raw: string | null): StudyMascotPosition {
  if (!raw) return { ...DEFAULT_STUDY_MASCOT_POSITION };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return { ...DEFAULT_STUDY_MASCOT_POSITION };
    const position = value as { x?: unknown; y?: unknown };
    if (typeof position.x !== "number" || typeof position.y !== "number") return { ...DEFAULT_STUDY_MASCOT_POSITION };
    return {
      x: clampUnit(position.x, DEFAULT_STUDY_MASCOT_POSITION.x),
      y: clampUnit(position.y, DEFAULT_STUDY_MASCOT_POSITION.y),
    };
  } catch {
    return { ...DEFAULT_STUDY_MASCOT_POSITION };
  }
}

export async function readStudyMascotPosition(storage: Pick<StorageAdapter, "getItem">): Promise<StudyMascotPosition> {
  try { return parseStudyMascotPosition(await storage.getItem(STUDY_MASCOT_POSITION_KEY)); }
  catch { return { ...DEFAULT_STUDY_MASCOT_POSITION }; }
}

export async function writeStudyMascotPosition(
  storage: Pick<StorageAdapter, "setItem">,
  position: StudyMascotPosition,
): Promise<void> {
  await storage.setItem(STUDY_MASCOT_POSITION_KEY, JSON.stringify({
    x: clampUnit(position.x, DEFAULT_STUDY_MASCOT_POSITION.x),
    y: clampUnit(position.y, DEFAULT_STUDY_MASCOT_POSITION.y),
  }));
}

export async function readStudyMascotVisibility(storage: Pick<StorageAdapter, "getItem">): Promise<boolean> {
  try {
    const value = await storage.getItem(STUDY_MASCOT_VISIBILITY_KEY);
    if (value === "1") return true;
    if (value === "0") return false;
  } catch {
    // A cosmetic preference must not block study startup.
  }
  return DEFAULT_STUDY_MASCOT_VISIBLE;
}

export async function writeStudyMascotVisibility(
  storage: Pick<StorageAdapter, "setItem">,
  visible: boolean,
): Promise<void> {
  await storage.setItem(STUDY_MASCOT_VISIBILITY_KEY, visible ? "1" : "0");
}

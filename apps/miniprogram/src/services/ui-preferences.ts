import { reactive } from "vue";
import { UniStorageAdapter } from "../adapters/storage";
import type { StorageAdapter } from "../adapters/types";

export type MiniMotionMode = "standard" | "reduced";
export const MINI_MOTION_KEY = "kotobud.miniprogram.ui.motion.v1";

// Device-local presentation settings never enter learning snapshots or sync.
export function createMiniUiPreferences(storage: Pick<StorageAdapter, "getItem" | "setItem">) {
  const state = reactive({ mode: "standard" as MiniMotionMode, ready: false, foreground: true });
  let revision = 0;
  let reading: Promise<void> | undefined;
  async function load(): Promise<void> {
    if (reading) return reading;
    const beforeRead = revision;
    reading = (async () => {
      try {
        const saved = await storage.getItem(MINI_MOTION_KEY);
        if (beforeRead === revision) state.mode = saved === "reduced" ? "reduced" : "standard";
      } catch {
        // A storage read failure must not hide content or undo an active choice.
      } finally { state.ready = true; }
    })().finally(() => { reading = undefined; });
    return reading;
  }
  async function setMode(mode: MiniMotionMode): Promise<void> {
    await storage.setItem(MINI_MOTION_KEY, mode);
    revision++;
    state.mode = mode;
    state.ready = true;
  }
  return { state, load, setMode };
}

export const miniUi = createMiniUiPreferences(new UniStorageAdapter());

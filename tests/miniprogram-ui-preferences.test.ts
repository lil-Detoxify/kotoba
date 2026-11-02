import { describe, expect, it, vi } from "vitest";
import { createMiniUiPreferences, MINI_MOTION_KEY } from "../apps/miniprogram/src/services/ui-preferences";

describe("mini-program device-local motion preference", () => {
  it("restores reduced motion without touching a learning partition", async () => {
    const storage = { getItem: vi.fn(async () => "reduced"), setItem: vi.fn(async () => {}) };
    const ui = createMiniUiPreferences(storage);
    await ui.load();
    expect(ui.state.mode).toBe("reduced");
    expect(ui.state.ready).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith(MINI_MOTION_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("keeps content available if storage cannot be read", async () => {
    const ui = createMiniUiPreferences({ getItem: async () => { throw new Error("unavailable"); }, setItem: async () => {} });
    await ui.load();
    expect(ui.state.ready).toBe(true);
    expect(ui.state.mode).toBe("standard");
  });
  it("does not show a successful change when persistence fails", async () => {
    const ui = createMiniUiPreferences({ getItem: async () => "reduced", setItem: async () => { throw new Error("full"); } });
    await ui.load();
    await expect(ui.setMode("standard")).rejects.toThrow("full");
    expect(ui.state.mode).toBe("reduced");
  });
  it("ignores a stale read after a newly saved choice", async () => {
    let finishRead!: (value: string) => void;
    const storage = { getItem: () => new Promise<string>((resolve) => { finishRead = resolve; }), setItem: vi.fn(async () => {}) };
    const ui = createMiniUiPreferences(storage);
    const read = ui.load();
    await ui.setMode("reduced");
    finishRead("standard");
    await read;
    expect(ui.state.mode).toBe("reduced");
    expect(storage.setItem).toHaveBeenCalledWith(MINI_MOTION_KEY, "reduced");
  });
});

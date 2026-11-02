import { afterEach, describe, expect, it, vi } from "vitest";
import { createMiniEntrance, REST_ENTRANCE, type MiniEntranceFrame } from "../apps/miniprogram/src/services/mini-motion";

const controllers: Array<ReturnType<typeof createMiniEntrance>> = [];
afterEach(() => { controllers.splice(0).forEach((controller) => controller.dispose()); });
function setup() {
  const render = vi.fn<(frame: MiniEntranceFrame) => void>();
  const controller = createMiniEntrance(render);
  controllers.push(controller);
  return { render, controller };
}

describe("native mini-program GSAP entrances", () => {
  it("animates plain objects without a browser and settles at the exact readable pose", () => {
    const { render, controller } = setup();
    controller.enter(true);
    expect(controller.animation?.duration()).toBeCloseTo(.64);
    controller.animation!.progress(1);
    expect(render.mock.lastCall?.[0]).toEqual(REST_ENTRANCE);
  });
  it("kills an interrupted entrance and immediately restores all content", () => {
    const { render, controller } = setup();
    controller.enter(true);
    const old = controller.animation!;
    old.progress(.3);
    controller.stop();
    expect(old.parent).toBeNull();
    expect(controller.animation).toBeUndefined();
    expect(render.mock.lastCall?.[0]).toEqual(REST_ENTRANCE);
  });
  it("replaces a rapid repeated entrance instead of leaving concurrent timelines", () => {
    const { controller } = setup();
    controller.enter();
    const first = controller.animation!;
    controller.enter(true);
    expect(first.parent).toBeNull();
    expect(controller.animation).not.toBe(first);
  });
  it("makes disposal final and does not write styles on a detached view", () => {
    const { render, controller } = setup();
    controller.enter(true);
    controller.dispose();
    render.mockClear();
    controller.enter(true);
    controller.stop();
    expect(render).not.toHaveBeenCalled();
  });
});

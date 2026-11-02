import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { statisticsPalette } from "../apps/miniprogram/src/services/statistics-palette";

function canvasHarness(props: Record<string, unknown>) {
  const path = "apps/miniprogram/src/components/MiniStatisticsCanvas.vue";
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const script = compileScript(parse(source, { filename: path }).descriptor, { id: path });
  const body = script.content.match(/setup\(__props(?:: any)?, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/)?.[1];
  if (!body) throw new Error("Unable to compile statistics canvas setup");
  const code = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.replace(/__expose\(\);\s*/, "");
  const callbacks: Array<(rect: { width: number; height: number }) => void> = [];
  let mount = () => {};
  let unmount = () => {};
  const methods = ["clearRect", "setFontSize", "setFillStyle", "setTextAlign", "fillText", "setStrokeStyle", "setLineWidth", "beginPath", "moveTo", "lineTo", "stroke", "arc", "fill"];
  const ctx: Record<string, ReturnType<typeof vi.fn>> = Object.fromEntries(methods.map(method => [method, vi.fn()]));
  ctx.draw = vi.fn((_reserve, done) => done());
  const proxy = { scope: "statistics-component" };
  const query: any = { in: vi.fn(() => query), select: vi.fn(() => query), boundingClientRect: vi.fn(callback => { callbacks.push(callback); return query; }), exec: vi.fn() };
  const uni = { createSelectorQuery: vi.fn(() => query), createCanvasContext: vi.fn(() => ctx), onWindowResize: vi.fn(), offWindowResize: vi.fn() };
  const harness = new Function("__props", "ref", "getCurrentInstance", "nextTick", "onMounted", "onUnmounted", "watch", "palette", "uni", code + "\nreturn { draw, unavailable };")(
    props, ref, () => ({ proxy }), async () => {}, (fn: () => void) => { mount = fn; }, (fn: () => void) => { unmount = fn; }, () => {}, statisticsPalette, uni,
  );
  return { harness, uni, ctx, query, proxy, callbacks, mount: () => mount(), unmount: () => unmount() };
}

describe("mini-program statistics canvas", () => {
  it("uses distinct integer labels for sparse counts and draws inside the measured component", async () => {
    const test = canvasHarness({ kind: "trend", days: [{ day: "2026-10-06", label: "10/6", words: 1, reviews: 1 }] });
    test.mount();
    await Promise.resolve();
    test.callbacks[0]({ width: 264, height: 190 });
    expect(test.query.in).toHaveBeenCalledWith(test.proxy);
    expect(test.uni.createCanvasContext).toHaveBeenCalledWith("learning-trend", test.proxy);
    expect(test.ctx.fillText.mock.calls.slice(0, 5).map(call => call[0])).toEqual(["0", "1", "2", "3", "4"]);
    const [x, y] = test.ctx.moveTo.mock.calls.at(-1)!;
    expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(264);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(190);
    expect(test.ctx.draw).toHaveBeenCalledOnce();
  });

  it("ignores stale size queries and removes the resize listener on unmount", async () => {
    const test = canvasHarness({ kind: "donut", shares: [], total: 0 });
    test.mount(); await Promise.resolve();
    await test.harness.draw();
    test.callbacks[0]({ width: 310, height: 190 });
    expect(test.uni.createCanvasContext).not.toHaveBeenCalled();
    test.unmount();
    test.callbacks[1]({ width: 310, height: 190 });
    expect(test.uni.createCanvasContext).not.toHaveBeenCalled();
    expect(test.uni.offWindowResize).toHaveBeenCalledWith(test.harness.draw);
  });
});

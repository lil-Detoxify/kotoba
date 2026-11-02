import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, compileScript } from "@vue/compiler-sfc";
import { ref, computed } from "vue";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Data } from "@jp/models";
import catalog from "../apps/miniprogram/src/services/textbooks-catalog.json";
import { learningAnalytics, libraryProgress } from "../apps/miniprogram/src/services/learning-analytics";

function page(repository: any) {
  const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/statistics/statistics.vue"), "utf8");
  const script = compileScript(parse(source).descriptor, { id: "statistics-page-test" });
  const body = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!body) throw new Error("Statistics setup was not extracted");
  const code = ts.transpileModule(body[1], { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText.replace(/__expose\(\);\s*/, "");
  const lifecycle: { show?: () => void; hide?: () => void; unload?: () => void } = {};
  const run = new Function("ref", "computed", "onShow", "onHide", "onUnload", "defaultRepository", "textbookCatalog", "learningAnalytics", "libraryProgress", "useMiniPageActivity", code + "\nreturn {refresh,toggleBook,data,currentBook,progress,analytics,openBooks,range,error,loading};");
  const harness = run(ref, computed, (fn: any) => { lifecycle.show = fn; }, (fn: any) => { lifecycle.hide = fn; }, (fn: any) => { lifecycle.unload = fn; }, repository, catalog.books, learningAnalytics, libraryProgress, () => {}) as {
    refresh: () => Promise<void>; toggleBook: (id: string) => void; [key: string]: any;
  };
  return { harness, lifecycle };
}
const empty = (currentBookId = "biaori-beginner-upper"): Data => ({ books: [], lessons: [], words: [], states: [], logs: [], currentBookId, seeded: true });

describe("mini statistics read-only page", () => {
  it("shows complete unloaded totals without writing or downloading textbooks", async () => {
    const snapshot = empty();
    const before = JSON.stringify(snapshot);
    const repository = { getActiveKey: () => "data_guest", read: vi.fn(async () => snapshot), transact: vi.fn(), transactAndEnqueue: vi.fn() };
    const { harness } = page(repository);
    await harness.refresh();
    expect(harness.progress.value.total).toBe(16926);
    expect(harness.currentBook.value.total).toBe(1077);
    expect(harness.openBooks.value).toEqual(["biaori-beginner-upper"]);
    harness.toggleBook("jlpt-n5");
    harness.range.value = 30;
    expect(harness.analytics.value.days).toHaveLength(30);
    expect(repository.transact).not.toHaveBeenCalled();
    expect(repository.transactAndEnqueue).not.toHaveBeenCalled();
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("updates stages and default drawers when the selected book changes", async () => {
    const snapshot = empty();
    const { harness } = page({ getActiveKey: () => "data_guest", read: async () => snapshot });
    await harness.refresh();
    snapshot.currentBookId = "jlpt-n5";
    await harness.refresh();
    expect(harness.currentBook.value.id).toBe("jlpt-n5");
    expect(harness.currentBook.value.total).toBe(674);
    expect(harness.currentBook.value.stages.new).toBe(674);
    expect(harness.openBooks.value).toEqual(["jlpt-n5"]);
  });

  it("discards a delayed read from the previous account", async () => {
    let key = "data_guest";
    let complete!: (data: Data) => void;
    const repository = { getActiveKey: () => key, read: (requested: string) => requested === "data_guest" ? new Promise<Data>(resolve => { complete = resolve; }) : Promise.resolve(empty("jlpt-n5")) };
    const { harness } = page(repository);
    const pending = harness.refresh();
    key = "data_user_b";
    await harness.refresh();
    complete(empty());
    await pending;
    expect(harness.currentBook.value.id).toBe("jlpt-n5");
    expect(harness.openBooks.value).toEqual(["jlpt-n5"]);
  });

  it("keeps read failures visible instead of replacing data with an empty success", async () => {
    const repository = { getActiveKey: () => "data_guest", read: async () => { throw new Error("missing snapshot"); }, transact: vi.fn() };
    const { harness } = page(repository);
    await harness.refresh();
    expect(harness.error.value).toContain("原有记录未被覆盖");
    expect(harness.data.value).toBeNull();
    expect(repository.transact).not.toHaveBeenCalled();
  });
});

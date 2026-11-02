import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as vue from "vue";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Run the actual page setup handlers with native input/confirm/tap payloads.
// Lifecycle hooks stay idle: these checks need no account, storage or network.
function compilePage(path: string, dependencies: Record<string, unknown> = {}) {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const script = compileScript(parse(source, { filename: path }).descriptor, { id: path });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const uni = { navigateTo: vi.fn(), showToast: vi.fn() };
  const module = { exports: {} as Record<string, any> };
  const requireModule = (name: string) => {
    if (name in dependencies) return dependencies[name];
    if (name === "vue") return vue;
    if (name === "@dcloudio/uni-app") return { onShow: vi.fn() };
    if (name.endsWith("/page-motion")) return { useMiniPageActivity: vi.fn() };
    if (name.endsWith("/textbooks")) return { textbookCatalog: [] };
    return {};
  };
  new Function("require", "module", "exports", "uni", code)(requireModule, module, module.exports, uni);
  const page = module.exports.default.setup({}, { expose: vi.fn() });
  return { page, uni };
}

function homeSearch() {
  return compilePage("apps/miniprogram/src/pages/index/index.vue");
}

function searchDestination() {
  let onLoad: ((options: Record<string, string>) => void) | undefined;
  const search = vi.fn(async () => ({ results: [], failedBookIds: [], status: "complete" }));
  const data = { books: [], lessons: [], words: [], states: [], logs: [], seeded: true };
  const lifecycle = { onLoad: (callback: typeof onLoad) => { onLoad = callback; }, onShow: vi.fn(), onHide: vi.fn(), onUnload: vi.fn() };
  // The dependencies use the import specifiers from the real search page.
  const { page } = compilePage("apps/miniprogram/src/pages/search/search.vue", {
    "@dcloudio/uni-app": lifecycle,
    "../../adapters": { defaultRepository: { getActiveKey: () => "data_guest", read: async () => data } },
    "../../services/privacy-consent": { defaultPrivacyConsent: { isConsented: async () => false } },
    "../../services/vocabulary-search": { defaultVocabularySearch: { search } },
  });
  return { page, search, load: (query: string) => onLoad!({ q: query }) };
}

describe("mini-program home search native input", () => {
  it("keeps Japanese input when the search button delivers a tap payload", () => {
    const { page, uni } = homeSearch();
    page.onSearchInput({ detail: { value: "がくせい" } });
    page.goToSearch({ type: "tap", detail: { x: 285, y: 495 } });
    expect(page.searchQuery.value).toBe("がくせい");
    expect(uni.showToast).not.toHaveBeenCalled();
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: "/pages/search/search?q=%E3%81%8C%E3%81%8F%E3%81%9B%E3%81%84" });
  });

  it("uses the final keyboard-confirm value even if the last input event is older", () => {
    const { page, uni } = homeSearch();
    page.onSearchInput({ detail: { value: "にほん" } });
    page.goToSearch({ detail: { value: "日本人" } });
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: `/pages/search/search?q=${encodeURIComponent("日本人")}` });
  });

  it("does not clear a typed query for an event without a text value", () => {
    const { page } = homeSearch();
    page.onSearchInput({ detail: { value: "学生" } });
    page.onSearchInput({ detail: {} });
    expect(page.searchQuery.value).toBe("学生");
  });

  it("still treats a real cleared input as empty instead of reusing an earlier query", () => {
    const { page, uni } = homeSearch();
    page.onSearchInput({ detail: { value: "学生" } });
    page.onSearchInput({ detail: { value: "" } });
    page.goToSearch({ type: "tap", detail: {} });
    expect(uni.navigateTo).not.toHaveBeenCalled();
    expect(uni.showToast).toHaveBeenCalledWith({ title: "请输入日语词或中文释义", icon: "none" });
  });
});

describe("mini-program search destination route text", () => {
  it.each(["学生", "がくせい", "学生".repeat(40)])("decodes the native route before displaying or truncating %s", async (text) => {
    const { page, search, load } = searchDestination();
    load(encodeURIComponent(text));
    expect(page.query.value).toBe(text);
    await vi.waitFor(() => expect(search).toHaveBeenCalledWith(text, expect.anything(), expect.any(Function), false));
  });

  it.each(["学生", "がくせい", "100% +"])("accepts an already decoded or malformed-percent query %s without throwing", (text) => {
    const { page, load } = searchDestination();
    expect(() => load(text)).not.toThrow();
    expect(page.query.value).toBe(text);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as vue from "vue";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type ShareCard = { title: string; imageUrl: string; path?: string; query?: string };
type PageOptions = {
  onShareAppMessage?: (this: Record<string, unknown>, event?: unknown) => ShareCard;
  onShareTimeline?: (this: Record<string, unknown>, event?: unknown) => ShareCard;
};

const miniRoot = resolve(process.cwd(), "apps/miniprogram/src");
const pages = JSON.parse(readFileSync(resolve(miniRoot, "pages.json"), "utf8")).pages as Array<{ path: string }>;

function evaluateModule(source: string, requireModule: (name: string) => unknown) {
  const code = ts.transpileModule(source.replaceAll("import.meta.env", "({})"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", code)(requireModule, module, module.exports);
  return module.exports;
}

function nativePageOptions(pagePath: string): PageOptions {
  const source = readFileSync(resolve(miniRoot, `${pagePath}.vue`), "utf8");
  const descriptor = parse(source, { filename: pagePath }).descriptor;
  const script = compileScript(descriptor, { id: pagePath });
  const requireModule = (name: string): unknown => {
    if (name === "vue") return vue;
    if (name.endsWith("/services/share")) {
      return evaluateModule(readFileSync(resolve(miniRoot, "services/share.ts"), "utf8"), requireModule);
    }
    // Page setup is not invoked: the regression targets the exported native
    // lifecycle callbacks, with no storage, login, audio or network side effects.
    return {};
  };
  return evaluateModule(script.content, requireModule).default;
}

describe("mini-program native sharing", () => {
  it.each(pages)("enables safe friend and timeline cards on $path", ({ path }) => {
    const options = nativePageOptions(path);
    expect(options.onShareAppMessage).toBeTypeOf("function");
    expect(options.onShareTimeline).toBeTypeOf("function");

    const context = {
      route: path,
      options: { token: "secret-token-fixture", query: "private-search-fixture", lessonId: "private-lesson-fixture" },
      account: { email: "private@example.invalid" },
      statistics: { learned: 927 },
    };
    const friend = options.onShareAppMessage!.call(context, { from: "menu" });
    const timeline = options.onShareTimeline!.call(context);
    expect(friend.title).toContain("KotoBud");
    expect(friend.path).toBe("/pages/index/index");
    expect(friend.imageUrl).toMatch(/^\/static\/.+\.png$/);
    expect(existsSync(resolve(miniRoot, friend.imageUrl.slice(1)))).toBe(true);
    expect(timeline).toEqual({ title: friend.title, imageUrl: friend.imageUrl, query: "" });
    for (const card of [friend, timeline]) {
      expect(JSON.stringify(card)).not.toMatch(/secret-token|private-search|private-lesson|private@example|927/);
    }

    friend.title = "changed by a previous share";
    expect(options.onShareAppMessage!.call(context).title).toContain("KotoBud");
  });
});

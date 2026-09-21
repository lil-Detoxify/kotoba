import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Data, WordState } from "@jp/models";
import { computed as vueComputed, ref as vueRef } from "vue";
import { textbookCatalog } from "../apps/miniprogram/src/services/textbooks";

type Lifecycle = { show?: () => void };

function compilePage(path: string, dependencies: Record<string, unknown>, returned: string) {
  const source = readFileSync(resolve(process.cwd(), path), "utf8");
  const descriptor = parse(source, { filename: path }).descriptor;
  const script = compileScript(descriptor, { id: path });
  const setupMatch = script.content.match(/setup\(__props, \{ expose: __expose \}\) \{\n([\s\S]*?)\n\nconst __returned__/);
  if (!setupMatch) throw new Error(`Unable to extract ${path} script setup body`);
  let code = ts.transpileModule(setupMatch[1], {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText.replace(/__expose\(\);\s*/, "");
  code = code.replace(/^import .*?;\r?\n/gm, "");
  code += `\nreturn { ${returned} };`;
  const names = Object.keys(dependencies);
  return new Function(...names, "ref", "computed", "onShow", code)(
    ...names.map((name) => dependencies[name]), vueRef, vueComputed,
    (callback: () => void) => { (dependencies.lifecycle as Lifecycle).show = callback; },
  ) as any;
}

function bookData(): Data {
  const now = new Date();
  const lower = textbookCatalog[1];
  const wordId = `${lower.id}-w-25-1077`;
  const state: WordState = {
    userId: "local",
    wordId,
    status: "learning",
    isIgnored: false,
    isDifficult: true,
    firstSeenAt: now.toISOString(),
    lastReviewedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() - 60_000).toISOString(),
    reviewCount: 1,
    lapseCount: 0,
    card: {} as WordState["card"],
    bookId: lower.id,
    lessonId: lower.lessons[0].id,
    updatedAt: now.toISOString(),
  };
  return {
    books: textbookCatalog.map((book) => ({
      id: book.id,
      title: book.title,
      description: book.description,
      language: "ja",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })),
    lessons: textbookCatalog.flatMap((book) => book.lessons.map((lesson) => ({
      id: lesson.id,
      bookId: book.id,
      title: lesson.title,
      order: lesson.order,
    }))),
    // The dashboard must work with a catalog-only snapshot.
    words: [],
    states: [state],
    logs: [{
      id: "log-dashboard-1",
      userId: "local",
      wordId,
      reviewedAt: now.toISOString(),
      rating: 3,
      responseTime: 1000,
      previousState: { ...state, firstSeenAt: undefined, reviewCount: 0 },
      newState: state,
      studyMode: "new",
      clientCreatedAt: now.toISOString(),
    }],
    currentBookId: textbookCatalog[0].id,
    currentBookIdSource: "default",
    seeded: true,
  };
}

function loadIndexPage(textbooks: any) {
  const lifecycle: Lifecycle = {};
  const uni = { navigateTo: vi.fn(), switchTab: vi.fn() };
  const harness = compilePage(
    "apps/miniprogram/src/pages/index/index.vue",
    {
      lifecycle,
      defaultTextbooks: textbooks,
      textbookCatalog,
      calculateLearningStatistics: (awaitedStatistics: any, now?: Date) => {
        // Keep the page harness tied to the production service contract.
        return requireLearningStatistics(awaitedStatistics, now);
      },
      uni,
    },
    "refreshData, loadData, goToStudy, goToBooks, goToLists, goToReview, goToDifficult, activityHeight, refs: { appData, statistics, loading, currentBookTitle, loadError }",
  );
  return { harness, lifecycle, uni };
}

function requireLearningStatistics(data: Data, now?: Date) {
  // Imported lazily here to keep the fixture setup above readable while still
  // exercising the exact service implementation used by the page.
  return calculateLearningStatistics(data, now);
}

function loadBooksPage(textbooks: any) {
  const lifecycle: Lifecycle = {};
  const uni = { navigateTo: vi.fn() };
  const harness = compilePage(
    "apps/miniprogram/src/pages/books/books.vue",
    {
      lifecycle,
      defaultTextbooks: textbooks,
      isBookLoaded: vi.fn(() => false),
      textbookCatalog,
      calculateLearningStatistics,
      uni,
    },
    "refresh, download, selectBook, studyLesson, openLists, progressFor, refs: { data, loading, loadingBook, loadError, bookErrors, bookStatistics }",
  );
  return { harness, lifecycle, uni };
}

import { calculateLearningStatistics } from "../apps/miniprogram/src/services/learning-statistics";

describe("mini-program dashboard pages", () => {
  it("renders catalog-only dashboard metrics without downloading textbook bodies", async () => {
    const data = bookData();
    const textbooks = { hydrate: vi.fn(async () => data) };
    const { harness, lifecycle } = loadIndexPage(textbooks);

    expect(readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/index/index.vue"), "utf8"))
      .toMatch(/近 7 日活动/);
    expect(lifecycle.show).toBeTypeOf("function");
    await harness.refreshData();

    expect(textbooks.hydrate).toHaveBeenCalledOnce();
    expect(harness.refs.loading.value).toBe(false);
    expect(harness.refs.statistics.value).toMatchObject({ learned: 1, due: 1, difficult: 1, todayNew: 1, todayReview: 0, streak: 1 });
    expect(harness.refs.statistics.value.books.find((book: any) => book.bookId === textbookCatalog[1].id))
      .toMatchObject({ learned: 1, total: textbookCatalog[1].wordCount });
    expect(harness.activityHeight(1)).toBeGreaterThan(0);
  });

  it("shows a retryable error and uses a neutral current-book CTA", async () => {
    const textbooks = { hydrate: vi.fn(async () => { throw new Error("offline"); }) };
    const { harness, uni } = loadIndexPage(textbooks);
    await harness.refreshData();

    expect(harness.refs.loading.value).toBe(false);
    expect(harness.refs.loadError.value).toContain("无法读取");
    expect(readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/index/index.vue"), "utf8"))
      .not.toContain("精确续学");
    harness.goToStudy();
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: "/pages/study/study" });
    harness.goToDifficult();
    expect(uni.navigateTo).toHaveBeenCalledWith({ url: "/pages/study/study?mode=difficult" });
  });

  it("shows per-book catalog progress while keeping download state separate", async () => {
    const data = bookData();
    const textbooks = { hydrate: vi.fn(async () => data), ensureBookLoaded: vi.fn() };
    const { harness, lifecycle } = loadBooksPage(textbooks);
    const source = readFileSync(resolve(process.cwd(), "apps/miniprogram/src/pages/books/books.vue"), "utf8");
    expect(source).toContain("正文未下载，进度仍按目录统计");
    expect(source).toContain("progress-track");

    expect(lifecycle.show).toBeTypeOf("function");
    await harness.refresh();
    const lower = harness.progressFor(textbookCatalog[1]);
    expect(lower).toMatchObject({ learned: 1, total: textbookCatalog[1].wordCount, percent: 0 });
    expect(textbooks.ensureBookLoaded).not.toHaveBeenCalled();
    expect(harness.refs.bookStatistics.value).toHaveLength(6);
  });
});

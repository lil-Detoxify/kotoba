import { describe, expect, it } from "vitest";
import { parse, compileScript, compileTemplate } from "@vue/compiler-sfc";
import { readFileSync } from "node:fs";
import { analyzeKanaAnswer } from "../apps/miniprogram/src/services/kana-answer-diff";

const source = "apps/miniprogram/src/components/MiniInputQuestion.vue";
const descriptor = parse(readFileSync(source, "utf8"), { filename: source }).descriptor;

describe("Mini Program kana retry", () => {
  it("uses the shared character diff and compiles the local retry UI", () => {
    expect(analyzeKanaAnswer("がこう", "がっこう").correct).toEqual([
      { text: "が", kind: "same" },
      { text: "っ", kind: "missing" },
      { text: "こう", kind: "same" },
    ]);
    expect(() => compileScript(descriptor, { id: "mini-kana-retry" })).not.toThrow();
    const compiled = compileTemplate({ source: descriptor.template!.content, filename: source, id: "mini-kana-retry" });
    expect(compiled.errors).toEqual([]);
    expect(descriptor.scriptSetup?.content).toContain("analyzeKanaAnswer(retryValue.value.trim(), props.attempt.correct)");
    expect(descriptor.scriptSetup?.content).not.toContain("emit('submit', retryValue");
    expect(descriptor.template?.content).toContain("练习重试不改变首次作答结果。");
    expect(descriptor.template?.content).toContain("这次写对了");
  });

  it("keeps retry keyboard handling local and IME safe", () => {
    expect(descriptor.scriptSetup?.content).toContain("native.stopPropagation?.()");
    expect(descriptor.scriptSetup?.content).toContain("native.isComposing || native.keyCode === 229 || retryComposing.value");
    expect(descriptor.template?.content).toContain('@confirm="handleRetryConfirm"');
    expect(descriptor.template?.content).toContain("@compositionend=\"handleRetryCompositionEnd\"");
  });
});

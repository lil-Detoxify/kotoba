import { describe, expect, it } from 'vitest';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { readFileSync } from 'node:fs';

const path = 'apps/web/src/components/KanaInputQuestion.vue';
const source = readFileSync(path, 'utf8');
const { descriptor, errors } = parse(source, { filename: path });

describe('KanaInputQuestion retry UI', () => {
  it('compiles and keeps retries local with explicit first-attempt feedback', () => {
    expect(errors).toEqual([]);
    expect(() => compileScript(descriptor, { id: 'web-kana-retry-component-test' })).not.toThrow();
    const compiled = compileTemplate({
      source: descriptor.template!.content,
      filename: path,
      id: 'web-kana-retry-component-test',
    });
    expect(compiled.errors).toEqual([]);
    expect(descriptor.scriptSetup?.content).toContain("analyzeKanaAnswer(retryValue.value.trim(), props.attempt?.correct ?? props.question.correct)");
    expect(descriptor.scriptSetup?.content).not.toContain("emit('submit', retryValue");
    expect(descriptor.template?.content).toContain('练习重试不改变首次作答结果。');
    expect(descriptor.template?.content).toContain('这次写对了');
    expect(descriptor.template?.content).toContain('再试一次');
    expect(descriptor.template?.content).toContain('kana-retry-input');
  });

  it('stops retry Enter from reaching the study shortcut and ignores IME composition', () => {
    const script = descriptor.scriptSetup?.content ?? '';
    expect(script).toContain('event.stopPropagation()');
    expect(script).toContain('retryComposing.value || event.isComposing || event.keyCode === 229');
    expect(descriptor.template?.content).toContain('@keydown.enter="handleRetryEnter"');
    expect(descriptor.template?.content).toContain('@submit.prevent.stop="submitRetry"');
  });
});

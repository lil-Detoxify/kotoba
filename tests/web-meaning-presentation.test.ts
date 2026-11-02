import { describe, expect, it } from 'vitest';
import { meaningParts, meaningPresentation, meaningOptionLabels } from '../apps/web/src/services/meaning-presentation';

describe('Concise JLPT gloss presentation', () => {
  it('shows a short gloss and retains other meanings without changing the source', () => {
    const word = { lessonId: 'jlpt-n5-l-1', meaning: '推；推动；用力推；按；按下；压' };
    expect(meaningPresentation(word)).toEqual({ summary: '推、推动', parts: ['推', '推动', '用力推', '按', '按下', '压'], hasMore: true });
    expect(word.meaning).toBe('推；推动；用力推；按；按下；压');
    expect(meaningPresentation({ ...word, lessonId: 'custom-lesson' }).summary).toBe(word.meaning);
  });
  it('keeps a semicolon inside a parenthetical explanation with its own meaning', () => {
    expect(meaningParts('炬燵；暖桌（桌下置电热器；原为地炉上置炭火盆）')).toEqual(['炬燵', '暖桌（桌下置电热器；原为地炉上置炭火盆）']);
  });
  it('does not turn different quiz options into identical short labels', () => {
    const options = ['相遇；碰面；见面', '相遇；碰面；遭遇', '按；按下', '打开；开启'];
    const labels = meaningOptionLabels(options);
    expect(new Set(labels).size).toBe(options.length);
    expect(labels.every(label => label.length > 0)).toBe(true);
    expect(options[0]).toBe('相遇；碰面；见面');
  });
});

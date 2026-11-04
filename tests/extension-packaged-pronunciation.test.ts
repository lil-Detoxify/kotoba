import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const generated = vi.hoisted(() => ({url: ''}));
vi.mock('../apps/web/src/services/audioUrl', () => ({getGoogleAudioUrl: async () => generated.url}));
vi.mock('vue', async () => ({...await vi.importActual('vue'), onMounted: vi.fn(), onUnmounted: vi.fn()}));
import { createExtensionPronunciation } from '../apps/extension/src/audio';

const sources: string[] = [];
let pronunciation: ReturnType<typeof createExtensionPronunciation>;
beforeEach(() => {
  sources.length = 0;
  vi.stubGlobal('location', {href:'chrome-extension://test-id/learning.html'});
  vi.stubGlobal('document', {hidden:false});
  vi.stubGlobal('Audio', class {
    onplaying: (() => void) | null = null;
    onended = null; onerror = null;
    constructor(src: string) { sources.push(src); }
    async play() { this.onplaying?.(); }
    pause() {} load() {} removeAttribute() {}
  });
  pronunciation = createExtensionPronunciation();
});
afterEach(() => { pronunciation.stop(); vi.unstubAllGlobals(); });
const word = {id:'biaori-beginner-upper-w-1-1',lessonId:'biaori-beginner-upper-l-1',term:'ボウリング',reading:'ぼうりんぐ',meaning:'保龄球',order:1,source:'textbook' as const};
it.each(['./assets/corrected-12345678.mp3','/assets/corrected-12345678.mp3','chrome-extension://test-id/assets/corrected-12345678.mp3'])('plays the packaged corrected clip offline: %s', async url => {
  generated.url = url;
  expect(await pronunciation.play(word)).toBe(true);
  expect(sources).toEqual(['chrome-extension://test-id/assets/corrected-12345678.mp3']);
  expect(pronunciation.source.value).toEqual({kind:'google',voice:'female'});
});
it('rejects a clip belonging to another extension', async () => {
  generated.url = 'chrome-extension://another-id/assets/corrected-12345678.mp3';
  expect(await pronunciation.play(word)).toBe(false);
  expect(sources).toEqual([]);
});

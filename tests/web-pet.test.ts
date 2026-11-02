import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PET_MANIFESTS, resolvePetAnimation } from '../apps/web/src/pet/manifest';
import { notifyPet } from '../apps/web/src/pet/runtime';
import {
  DEFAULT_PET_SETTINGS, PET_POSITION_KEY, PET_SETTINGS_KEY, clampPetPosition, clearPetPosition,
  defaultPetPosition, effectiveReducedMotion, parsePetSettings, petPositionForViewport, readPetPosition, readPetSettings,
  writePetPosition, writePetSettings, type PetStorage,
} from '../apps/web/src/pet/settings';
import { initialPetSnapshot, PET_SLEEP_AFTER_MS, transitionPet } from '../apps/web/src/pet/state';

function memoryStorage(): PetStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

describe('Web/Windows Leaf Cat MVP', () => {
  it('uses complete local defaults and tolerates malformed settings', () => {
    const storage = memoryStorage();
    expect(readPetSettings(storage)).toEqual(DEFAULT_PET_SETTINGS);
    storage.setItem(PET_SETTINGS_KEY, '{broken');
    expect(readPetSettings(storage)).toEqual(DEFAULT_PET_SETTINGS);
    expect(parsePetSettings({ enabled: 'yes', variant: 'unknown', reactionsEnabled: 0, motionMode: 'fast' })).toEqual(DEFAULT_PET_SETTINGS);
    expect(DEFAULT_PET_SETTINGS.studyVisibility).toBe('hide');
    expect(parsePetSettings({ studyVisibility: 'companion' }).studyVisibility).toBe('companion');
    expect(parsePetSettings({ studyVisibility: 'unexpected' }).studyVisibility).toBe('hide');
  });

  it('switches classic/pixel without changing the state model', () => {
    const storage = memoryStorage();
    const pixel = parsePetSettings({ ...DEFAULT_PET_SETTINGS, variant: 'pixel' });
    writePetSettings(storage, pixel);
    expect(readPetSettings(storage).variant).toBe('pixel');
    expect(PET_MANIFESTS.classic.id).toBe('classic');
    expect(PET_MANIFESTS.pixel.id).toBe('pixel');
    expect(Object.keys(PET_MANIFESTS.classic.animations)).toEqual(Object.keys(PET_MANIFESTS.pixel.animations));
    for (const manifest of Object.values(PET_MANIFESTS)) {
      expect(manifest.assetVersion).toBe('sprite-frames-v2');
      expect(Object.keys(manifest.animations)).toHaveLength(8);
      expect(manifest.animations.idle?.frames).toMatchObject([
        { layout: 'single', src: `/pet/leaf-cat-${manifest.id}-idle-open-v2.png` },
        { layout: 'single', src: `/pet/leaf-cat-${manifest.id}-idle-blink-v2.png` },
      ]);
      expect(manifest.animations.complete?.frames[0]).toMatchObject({ layout: 'single', src: `/pet/leaf-cat-${manifest.id}-complete-v2.png` });
      expect(manifest.animations.correct?.frames[0]).toMatchObject({ layout: 'single', src: `/pet/leaf-cat-${manifest.id}-correct-v2.png` });
    }
  });

  it('maps only the classic streak state to its standalone full frame', () => {
    const classicStreak = resolvePetAnimation(PET_MANIFESTS.classic, 'streak').frames;
    expect(classicStreak).toMatchObject([{
      layout: 'single', src: '/pet/leaf-cat-classic-streak-v1.png', width: 1254, height: 1254,
    }]);

    expect(resolvePetAnimation(PET_MANIFESTS.pixel, 'streak').frames).toMatchObject([{
      layout: 'single', src: '/pet/leaf-cat-pixel-streak-v2.png', width: 418, height: 418,
    }]);
    for (const state of ['idle', 'sleeping', 'studying', 'correct', 'wrong', 'review', 'complete'] as const) {
      expect(PET_MANIFESTS.classic.animations[state]?.frames.every(frame =>
        frame.layout === 'single' && frame.src.startsWith('/pet/leaf-cat-classic-'))).toBe(true);
      expect(PET_MANIFESTS.pixel.animations[state]?.frames.every(frame =>
        frame.layout === 'single' && frame.src.startsWith('/pet/leaf-cat-pixel-'))).toBe(true);
    }
  });

  it('serves every pose from its own cropped PNG and uses idle as the skin thumbnail', () => {
    for (const manifest of Object.values(PET_MANIFESTS)) {
      const frames = Object.entries(manifest.animations).flatMap(([state, animation]) =>
        (animation?.frames ?? []).map(frame => ({ state, frame })));
      expect(frames).toHaveLength(9);
      expect(manifest.thumbnail).toBe(manifest.animations.idle?.frames[0].src);

      for (const { state, frame } of frames) {
        expect(frame.layout).toBe('single');
        const bytes = readFileSync(resolve(process.cwd(), 'apps/web/public', frame.src.replace(/^\/+/, '')));
        const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(String.fromCharCode(...bytes.subarray(1, 4))).toBe('PNG');
        const expectedSize = manifest.id === 'classic' && state === 'streak' ? 1254 : 418;
        expect(frame.width).toBe(expectedSize);
        expect(frame.height).toBe(expectedSize);
        expect(header.getUint32(16)).toBe(expectedSize);
        expect(header.getUint32(20)).toBe(expectedSize);
      }
      expect(new Set(frames.map(({ frame }) => frame.src)).size).toBe(frames.length);
    }
  });

  it('handles learning, review, gentle reactions, streak, completion and sleep', () => {
    const settings = { ...DEFAULT_PET_SETTINGS };
    const start = initialPetSnapshot(0);
    const learning = transitionPet(start, { type: 'start-study', mode: 'new' }, settings, 1);
    expect(learning.state).toBe('studying');
    const first = transitionPet(learning, { type: 'answer', correct: true }, settings, 2);
    expect(first.state).toBe('correct');
    const second = transitionPet(first, { type: 'answer', correct: true }, settings, 3);
    const third = transitionPet(second, { type: 'answer', correct: true }, settings, 4);
    expect(third.state).toBe('streak');
    const wrong = transitionPet(third, { type: 'answer', correct: false }, settings, 5);
    expect(wrong).toMatchObject({ state: 'wrong', correctStreak: 0 });
    const reviewed = transitionPet(wrong, { type: 'start-study', mode: 'review' }, settings, 6);
    expect(reviewed.state).toBe('review');
    const complete = transitionPet(reviewed, { type: 'complete' }, settings, 7);
    expect(complete.state).toBe('complete');
    const idle = transitionPet(complete, { type: 'reaction-end' }, settings, complete.reactionUntil!);
    expect(idle.state).toBe('idle');
    const sleeping = transitionPet(idle, { type: 'idle-timeout' }, settings, idle.lastActiveAt + PET_SLEEP_AFTER_MS);
    expect(sleeping.state).toBe('sleeping');
    expect(transitionPet(sleeping, { type: 'tap' }, settings, 2 * PET_SLEEP_AFTER_MS).state).toBe('idle');
  });

  it('shows the final answer reaction before the completion stretch', () => {
    const settings = { ...DEFAULT_PET_SETTINGS, studyVisibility: 'companion' as const };
    const learning = transitionPet(initialPetSnapshot(0), { type: 'start-study', mode: 'new' }, settings, 1);
    const right = transitionPet(learning, { type: 'answer', correct: true }, settings, 2);
    const queued = transitionPet(right, { type: 'complete' }, settings, 3);
    expect(queued).toMatchObject({ state: 'correct', pendingComplete: true });
    const stretch = transitionPet(queued, { type: 'reaction-end' }, settings, right.reactionUntil!);
    expect(stretch).toMatchObject({ state: 'complete', pendingComplete: false });
    expect(transitionPet(stretch, { type: 'reaction-end' }, settings, stretch.reactionUntil!).state).toBe('idle');

    const wrong = transitionPet(learning, { type: 'answer', correct: false }, settings, 4);
    const left = transitionPet(transitionPet(wrong, { type: 'complete' }, settings, 5), { type: 'leave-study' }, settings, 6);
    expect(left.state).toBe('wrong');
    expect(transitionPet(left, { type: 'reaction-end' }, settings, wrong.reactionUntil!).state).toBe('complete');
  });

  it('sleeps in study after inactivity and wakes into the learning posture', () => {
    const settings = { ...DEFAULT_PET_SETTINGS, studyVisibility: 'companion' as const };
    const learning = transitionPet(initialPetSnapshot(0), { type: 'start-study', mode: 'review' }, settings, 1);
    const sleeping = transitionPet(learning, { type: 'idle-timeout' }, settings, 1 + PET_SLEEP_AFTER_MS);
    expect(sleeping.state).toBe('sleeping');
    expect(transitionPet(sleeping, { type: 'activity' }, settings, 2 + PET_SLEEP_AFTER_MS).state).toBe('review');
  });

  it('falls back to idle when a future skin lacks the requested animation', () => {
    expect(resolvePetAnimation(PET_MANIFESTS.classic, 'not-created-yet').id).toBe('idle');
    const incomplete = { ...PET_MANIFESTS.pixel, animations: { idle: PET_MANIFESTS.pixel.animations.idle } };
    expect(resolvePetAnimation(incomplete, 'correct').id).toBe('idle');
    const empty = { ...PET_MANIFESTS.pixel, animations: { ...PET_MANIFESTS.pixel.animations,
      correct: { ...PET_MANIFESTS.pixel.animations.correct!, frames: [] } } };
    expect(resolvePetAnimation(empty, 'correct').id).toBe('idle');
  });

  it('does not transition when disabled and suppresses reactions when requested', () => {
    const start = initialPetSnapshot(0);
    expect(transitionPet(start, { type: 'start-study', mode: 'new' }, { ...DEFAULT_PET_SETTINGS, enabled: false }, 1)).toEqual(start);
    const quiet = { ...DEFAULT_PET_SETTINGS, reactionsEnabled: false };
    const learning = transitionPet(start, { type: 'start-study', mode: 'new' }, quiet, 1);
    expect(transitionPet(learning, { type: 'answer', correct: false }, quiet, 2).state).toBe('studying');
    expect(transitionPet(learning, { type: 'complete' }, quiet, 2).state).toBe('idle');
  });

  it('honours both explicit reduced mode and the operating-system preference', () => {
    expect(effectiveReducedMotion(DEFAULT_PET_SETTINGS, false)).toBe(false);
    expect(effectiveReducedMotion(DEFAULT_PET_SETTINGS, true)).toBe(true);
    expect(effectiveReducedMotion({ ...DEFAULT_PET_SETTINGS, motionMode: 'reduced' }, false)).toBe(true);
  });

  it('persists drag coordinates separately and clamps them after resize', () => {
    const storage = memoryStorage();
    writePetPosition(storage, { x: 900, y: 800 });
    expect(readPetPosition(storage)).toEqual({ x: 900, y: 800 });
    expect(clampPetPosition(readPetPosition(storage)!, { width: 500, height: 400 })).toEqual({ x: 416, y: 300 });
    expect(storage.values.has(PET_SETTINGS_KEY)).toBe(false);
  });

  it('resets saved position to the viewport default', () => {
    const storage = memoryStorage();
    writePetPosition(storage, { x: 30, y: 40 });
    clearPetPosition(storage);
    expect(storage.values.has(PET_POSITION_KEY)).toBe(false);
    expect(readPetPosition(storage)).toBeNull();
    expect(defaultPetPosition({ width: 500, height: 400 })).toEqual({ x: 260, y: 8 });
  });

  it('uses a safe default when a saved position belongs to another layout', () => {
    const compact = { x: 210, y: 8, viewportWidth: 390 };
    expect(petPositionForViewport(compact, { width: 1280, height: 800 })).toEqual(defaultPetPosition({ width: 1280, height: 800 }));
    expect(petPositionForViewport(compact, { width: 400, height: 700 })).toEqual({ x: 210, y: 8 });
    expect(petPositionForViewport({ x: 210, y: 8 }, { width: 1280, height: 800 })).toEqual(defaultPetPosition({ width: 1280, height: 800 }));
  });

  it('migrates partial legacy settings and rejects malformed coordinates', () => {
    const storage = memoryStorage();
    storage.setItem(PET_SETTINGS_KEY, JSON.stringify({ enabled: false, variant: 'pixel' }));
    expect(readPetSettings(storage)).toMatchObject({ enabled: false, variant: 'pixel', reactionsEnabled: true, motionMode: 'standard', studyVisibility: 'hide' });
    storage.setItem(PET_POSITION_KEY, JSON.stringify({ x: '12', y: 3 }));
    expect(readPetPosition(storage)).toBeNull();
  });

  it('lets learning continue if Pet dispatch fails', () => {
    const saveLearning = vi.fn();
    expect(() => {
      saveLearning();
      notifyPet({ type: 'answer', correct: true }, () => { throw Error('pet renderer unavailable'); });
    }).not.toThrow();
    expect(saveLearning).toHaveBeenCalledOnce();
  });
});

import type { PetAnimation, PetFrame, PetManifest, PetState, PetVariant } from './model';

const poses: Record<PetState, string[]> = {
  idle: ['idle-open', 'idle-blink'],
  sleeping: ['sleeping'],
  studying: ['studying'],
  correct: ['correct'],
  wrong: ['wrong'],
  review: ['review'],
  streak: ['streak'],
  complete: ['complete'],
};

function frameFor(variant: PetVariant, state: PetState, pose: string, index: number): PetFrame {
  if (variant === 'classic' && state === 'streak') {
    return { layout: 'single', src: '/pet/leaf-cat-classic-streak-v1.png', width: 1254, height: 1254, durationMs: 1_000 };
  }

  return {
    layout: 'single',
    src: `/pet/leaf-cat-${variant}-${pose}-v2.png`,
    width: 418,
    height: 418,
    durationMs: state === 'idle' ? (index === 0 ? 3_400 : 150) : state === 'sleeping' ? 8_000 : 1_000,
  };
}

function animationsFor(variant: PetVariant): Partial<Record<PetState, PetAnimation>> {
  return Object.fromEntries((Object.keys(poses) as PetState[]).map(id => [id, {
    id,
    frames: poses[id].map((pose, index) => frameFor(variant, id, pose, index)),
    fps: id === 'idle' ? 7 : id === 'sleeping' ? 1 : 10,
    loop: id === 'idle' || id === 'sleeping' || id === 'studying' || id === 'review',
  }])) as Partial<Record<PetState, PetAnimation>>;
}

function manifest(id: PetVariant, name: string): PetManifest {
  const animations = animationsFor(id);
  return {
    id,
    name,
    assetVersion: 'sprite-frames-v2',
    thumbnail: animations.idle!.frames[0].src,
    fallbackState: 'idle',
    animations,
  };
}

export const PET_MANIFESTS: Record<PetVariant, PetManifest> = {
  classic: manifest('classic', '普通叶团猫'),
  pixel: manifest('pixel', '像素叶团猫'),
};

export function resolvePetAnimation(manifest: PetManifest, requested: string): PetAnimation {
  const selected = manifest.animations[requested as PetState];
  if (selected?.frames.length) return selected;
  const fallback = manifest.animations[manifest.fallbackState];
  if (fallback?.frames.length) return fallback;
  return PET_MANIFESTS.classic.animations.idle!;
}

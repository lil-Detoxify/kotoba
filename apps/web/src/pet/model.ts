export type PetVariant = 'classic' | 'pixel';
export type PetState = 'idle' | 'sleeping' | 'studying' | 'correct' | 'wrong' | 'review' | 'streak' | 'complete';
export type PetContext = 'idle' | 'studying' | 'review';

export interface PetSettings {
  enabled: boolean;
  variant: PetVariant;
  reactionsEnabled: boolean;
  motionMode: 'standard' | 'reduced';
  studyVisibility: 'hide' | 'companion';
}

export interface PetLocalPosition { x: number; y: number; viewportWidth?: number }
export interface PetViewport { width: number; height: number }

export type PetEvent =
  | { type: 'start-study'; mode: 'new' | 'review' | 'difficult' }
  | { type: 'leave-study' | 'complete' | 'activity' | 'tap' | 'idle-timeout' | 'reaction-end' }
  | { type: 'answer'; correct: boolean };

export interface PetSnapshot {
  state: PetState;
  context: PetContext;
  correctStreak: number;
  lastActiveAt: number;
  reactionUntil: number | null;
  pendingComplete: boolean;
}

export interface PetAnimation {
  id: PetState;
  frames: PetFrame[];
  fps: number;
  loop: boolean;
}

interface PetFrameBase {
  src: string;
  width: number;
  height: number;
  durationMs: number;
}

export type PetFrame = PetFrameBase & { layout: 'single' };

export interface PetManifest {
  id: PetVariant;
  name: string;
  assetVersion: string;
  thumbnail: string;
  fallbackState: 'idle';
  animations: Partial<Record<PetState, PetAnimation>>;
}

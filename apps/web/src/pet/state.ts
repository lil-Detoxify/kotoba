import type { PetEvent, PetSettings, PetSnapshot } from './model';

export const PET_SLEEP_AFTER_MS = 10 * 60_000;
const REACTION_MS = 1_400;
const COMPLETE_MS = 2_200;

export function initialPetSnapshot(now = Date.now()): PetSnapshot {
  return { state: 'idle', context: 'idle', correctStreak: 0, lastActiveAt: now, reactionUntil: null, pendingComplete: false };
}

/** Pure, deterministic state transition; learning data never flows into Pet. */
export function transitionPet(snapshot: PetSnapshot, event: PetEvent, settings: PetSettings, now: number): PetSnapshot {
  if (!settings.enabled) return snapshot;
  switch (event.type) {
    case 'start-study': {
      const context = event.mode === 'review' ? 'review' : 'studying';
      return { ...snapshot, context, state: context, correctStreak: 0, lastActiveAt: now, reactionUntil: null, pendingComplete: false };
    }
    case 'leave-study':
      return { ...snapshot, context: 'idle', state: snapshot.pendingComplete || snapshot.state === 'complete' ? snapshot.state : 'idle', correctStreak: 0, lastActiveAt: now };
    case 'answer': {
      const correctStreak = event.correct ? snapshot.correctStreak + 1 : 0;
      return { ...snapshot, correctStreak, lastActiveAt: now, pendingComplete: false,
        state: settings.reactionsEnabled ? (event.correct ? (correctStreak >= 3 ? 'streak' : 'correct') : 'wrong') : snapshot.context,
        reactionUntil: settings.reactionsEnabled ? now + REACTION_MS : null };
    }
    case 'complete':
      if (settings.reactionsEnabled && snapshot.reactionUntil !== null && snapshot.reactionUntil > now &&
        (snapshot.state === 'correct' || snapshot.state === 'wrong' || snapshot.state === 'streak')) {
        return { ...snapshot, correctStreak: 0, lastActiveAt: now, pendingComplete: true };
      }
      return { ...snapshot, context: 'idle', state: settings.reactionsEnabled ? 'complete' : 'idle',
        correctStreak: 0, lastActiveAt: now, reactionUntil: settings.reactionsEnabled ? now + COMPLETE_MS : null, pendingComplete: false };
    case 'activity':
    case 'tap':
      return { ...snapshot, state: snapshot.state === 'sleeping' ? snapshot.context : snapshot.state, lastActiveAt: now };
    case 'idle-timeout':
      return now - snapshot.lastActiveAt >= PET_SLEEP_AFTER_MS && snapshot.reactionUntil === null
        ? { ...snapshot, state: 'sleeping' } : snapshot;
    case 'reaction-end':
      if (snapshot.reactionUntil === null || now < snapshot.reactionUntil) return snapshot;
      return snapshot.pendingComplete
        ? { ...snapshot, context: 'idle', state: 'complete', reactionUntil: now + COMPLETE_MS, pendingComplete: false, lastActiveAt: now }
        : { ...snapshot, state: snapshot.context, reactionUntil: null };
  }
}

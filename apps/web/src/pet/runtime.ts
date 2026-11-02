import { reactive } from 'vue';
import type { PetEvent, PetLocalPosition, PetSettings } from './model';
import { DEFAULT_PET_SETTINGS, PET_POSITION_KEY, PET_SETTINGS_KEY, clearPetPosition, readPetPosition, readPetSettings, writePetPosition, writePetSettings, type PetStorage } from './settings';
import { initialPetSnapshot, PET_SLEEP_AFTER_MS, transitionPet } from './state';

export const pet = reactive({
  settings: { ...DEFAULT_PET_SETTINGS } as PetSettings,
  snapshot: initialPetSnapshot(),
  position: null as PetLocalPosition | null,
  visible: true,
  systemPrefersReduced: false,
});

let storage: PetStorage | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let initialized = false;

function browserStorage(): PetStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function cancelTimer(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
}

function scheduleNextState(): void {
  cancelTimer();
  if (!pet.settings.enabled || !pet.visible || pet.snapshot.state === 'sleeping') return;
  const now = Date.now();
  const reactionUntil = pet.snapshot.reactionUntil;
  if (reactionUntil !== null) {
    timer = setTimeout(() => applyPetEvent({ type: 'reaction-end' }), Math.max(1, reactionUntil - now));
    return;
  }
  timer = setTimeout(() => applyPetEvent({ type: 'idle-timeout' }), Math.max(1, PET_SLEEP_AFTER_MS - (now - pet.snapshot.lastActiveAt)));
}

export function initializePetRuntime(): void {
  if (initialized) return;
  initialized = true;
  storage = browserStorage();
  pet.settings = readPetSettings(storage);
  pet.position = readPetPosition(storage);
  pet.visible = typeof document === 'undefined' || document.visibilityState === 'visible';
  pet.snapshot = initialPetSnapshot();
  scheduleNextState();
}

export function setPetSettings(patch: Partial<PetSettings>): void {
  const next: PetSettings = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : pet.settings.enabled,
    variant: patch.variant === 'classic' || patch.variant === 'pixel' ? patch.variant : pet.settings.variant,
    reactionsEnabled: typeof patch.reactionsEnabled === 'boolean' ? patch.reactionsEnabled : pet.settings.reactionsEnabled,
    motionMode: patch.motionMode === 'standard' || patch.motionMode === 'reduced' ? patch.motionMode : pet.settings.motionMode,
    studyVisibility: patch.studyVisibility === 'hide' || patch.studyVisibility === 'companion' ? patch.studyVisibility : pet.settings.studyVisibility,
  };
  pet.settings = next;
  writePetSettings(storage ?? browserStorage(), next);
  if (!next.enabled) {
    cancelTimer();
    pet.snapshot = initialPetSnapshot();
  } else scheduleNextState();
}

export function setPetPosition(position: PetLocalPosition, persist = true): void {
  pet.position = { ...position };
  if (persist) writePetPosition(storage ?? browserStorage(), position);
}

export function resetPetPosition(): void {
  pet.position = null;
  clearPetPosition(storage ?? browserStorage());
}

export function setPetVisible(visible: boolean): void {
  pet.visible = visible;
  cancelTimer();
  if (!visible || !pet.settings.enabled) return;
  const now = Date.now();
  if (pet.snapshot.reactionUntil !== null && now >= pet.snapshot.reactionUntil) {
    pet.snapshot = transitionPet(pet.snapshot, { type: 'reaction-end' }, pet.settings, now);
  }
  pet.snapshot = transitionPet(pet.snapshot, { type: 'idle-timeout' }, pet.settings, now);
  scheduleNextState();
}

function applyPetEvent(event: PetEvent): void {
  if (!pet.settings.enabled) return;
  pet.snapshot = transitionPet(pet.snapshot, event, pet.settings, Date.now());
  scheduleNextState();
}

/** The learning path calls only this adapter; Pet errors never escape into FSRS. */
export function notifyPet(event: PetEvent, dispatch: (event: PetEvent) => void = applyPetEvent): void {
  try { dispatch(event); } catch { /* Pet is optional and must never block learning. */ }
}

export const PET_STORAGE_KEYS = { settings: PET_SETTINGS_KEY, position: PET_POSITION_KEY } as const;

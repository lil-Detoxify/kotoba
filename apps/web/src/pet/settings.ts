import type { PetLocalPosition, PetSettings, PetViewport } from './model';

export const PET_SETTINGS_KEY = 'kotobud.pet.settings.v1';
export const PET_POSITION_KEY = 'kotobud.pet.position.v1';
export const DEFAULT_PET_SETTINGS: PetSettings = {
  enabled: true,
  variant: 'classic',
  reactionsEnabled: true,
  motionMode: 'standard',
  studyVisibility: 'hide',
};

export interface PetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Invalid or old optional fields cannot make app startup fail. */
export function parsePetSettings(value: unknown): PetSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PET_SETTINGS };
  const raw = value as Record<string, unknown>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_PET_SETTINGS.enabled,
    variant: raw.variant === 'pixel' ? 'pixel' : 'classic',
    reactionsEnabled: typeof raw.reactionsEnabled === 'boolean' ? raw.reactionsEnabled : DEFAULT_PET_SETTINGS.reactionsEnabled,
    motionMode: raw.motionMode === 'reduced' ? 'reduced' : 'standard',
    studyVisibility: raw.studyVisibility === 'companion' ? 'companion' : 'hide',
  };
}

export function readPetSettings(storage?: PetStorage): PetSettings {
  try {
    const raw = storage?.getItem(PET_SETTINGS_KEY);
    return raw ? parsePetSettings(JSON.parse(raw)) : { ...DEFAULT_PET_SETTINGS };
  } catch { return { ...DEFAULT_PET_SETTINGS }; }
}

export function writePetSettings(storage: PetStorage | undefined, settings: PetSettings): void {
  try { storage?.setItem(PET_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* local preference is best effort */ }
}

export function parsePetPosition(value: unknown): PetLocalPosition | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return Number.isFinite(raw.x) && Number.isFinite(raw.y) &&
    typeof raw.x === 'number' && typeof raw.y === 'number' && raw.x >= 0 && raw.y >= 0
    ? { x: raw.x, y: raw.y, ...(typeof raw.viewportWidth === 'number' && Number.isFinite(raw.viewportWidth) && raw.viewportWidth > 0
      ? { viewportWidth: raw.viewportWidth } : {}) } : null;
}

export function readPetPosition(storage?: PetStorage): PetLocalPosition | null {
  try {
    const raw = storage?.getItem(PET_POSITION_KEY);
    return raw ? parsePetPosition(JSON.parse(raw)) : null;
  } catch { return null; }
}

export function writePetPosition(storage: PetStorage | undefined, position: PetLocalPosition): void {
  try { storage?.setItem(PET_POSITION_KEY, JSON.stringify(position)); } catch { /* local preference is best effort */ }
}

export function clearPetPosition(storage?: PetStorage): void {
  try { storage?.removeItem(PET_POSITION_KEY); } catch { /* local preference is best effort */ }
}

export function petSize(viewport: PetViewport): PetViewport {
  return viewport.width <= 760 ? { width: 76, height: 92 } : { width: 128, height: 148 };
}

export function clampPetPosition(position: PetLocalPosition, viewport: PetViewport): PetLocalPosition {
  const size = petSize(viewport);
  const inset = 8;
  return {
    x: Math.min(Math.max(position.x, inset), Math.max(inset, viewport.width - size.width - inset)),
    y: Math.min(Math.max(position.y, inset), Math.max(inset, viewport.height - size.height - inset)),
  };
}

export function defaultPetPosition(viewport: PetViewport, studyPage = false): PetLocalPosition {
  const size = petSize(viewport);
  const compactStudy = studyPage && viewport.width < 1100;
  return clampPetPosition({
    x: viewport.width <= 760 ? Math.round(viewport.width * 0.52) : viewport.width - size.width - 20,
    y: viewport.width <= 760 ? 8 : compactStudy ? 104 : viewport.height - size.height - 24,
  }, viewport);
}

/** A saved compact position must not land over desktop learning content, or vice versa. */
export function petPositionForViewport(position: PetLocalPosition | null, viewport: PetViewport, studyPage = false): PetLocalPosition {
  if (!position?.viewportWidth || (position.viewportWidth <= 760) !== (viewport.width <= 760)) {
    return defaultPetPosition(viewport, studyPage);
  }
  return clampPetPosition(position, viewport);
}

export function effectiveReducedMotion(settings: PetSettings, systemPrefersReduced: boolean): boolean {
  return settings.motionMode === 'reduced' || systemPrefersReduced;
}

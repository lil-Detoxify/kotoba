import { computed, onScopeDispose, readonly, shallowRef } from 'vue';
import { DICTIONARY_SOURCES, type DictionarySourceId } from './dictionary-comparison';

export interface DictionaryPreferences {
  order: DictionarySourceId[];
  hidden: DictionarySourceId[];
  preferredSource: DictionarySourceId;
}

export const DICTIONARY_PREFERENCES_KEY = 'kotobud.dictionary.comparison.preferences.v1';
const sourceIds = DICTIONARY_SOURCES.map(source => source.id);
const isSourceId = (value: unknown): value is DictionarySourceId =>
  typeof value === 'string' && sourceIds.some(id => id === value);

export function normalizeDictionaryPreferences(value: unknown): DictionaryPreferences {
  const input = value && typeof value === 'object' ? value as Partial<DictionaryPreferences> : {};
  const order = Array.from(new Set(Array.isArray(input.order) ? input.order.filter(isSourceId) : []));
  for (const id of sourceIds) if (!order.includes(id)) order.push(id);
  let hidden = Array.from(new Set(Array.isArray(input.hidden) ? input.hidden.filter(isSourceId) : []));
  if (hidden.length === sourceIds.length) hidden = hidden.filter(id => id !== order[0]);
  const preferredSource = isSourceId(input.preferredSource) && !hidden.includes(input.preferredSource)
    ? input.preferredSource
    : order.find(id => !hidden.includes(id)) ?? 'tomoshi';
  return { order, hidden, preferredSource };
}

function readPreferences(): DictionaryPreferences {
  try {
    return normalizeDictionaryPreferences(typeof localStorage === 'undefined'
      ? null : JSON.parse(localStorage.getItem(DICTIONARY_PREFERENCES_KEY) ?? 'null'));
  } catch {
    return normalizeDictionaryPreferences(null);
  }
}

const preferences = shallowRef<DictionaryPreferences>(readPreferences());
const savedLocally = shallowRef(true);
let consumers = 0;

function handleStorage(event: StorageEvent): void {
  if (event.key !== DICTIONARY_PREFERENCES_KEY && event.key !== null) return;
  preferences.value = readPreferences();
  savedLocally.value = true;
}

function updatePreferences(value: DictionaryPreferences): void {
  const next = normalizeDictionaryPreferences(value);
  preferences.value = next;
  try {
    localStorage.setItem(DICTIONARY_PREFERENCES_KEY, JSON.stringify(next));
    savedLocally.value = true;
  } catch {
    savedLocally.value = false;
  }
}

export function useDictionaryPreferences() {
  if (typeof window !== 'undefined') {
    if (consumers++ === 0) window.addEventListener('storage', handleStorage);
    onScopeDispose(() => {
      if (--consumers === 0) window.removeEventListener('storage', handleStorage);
    });
  }

  const orderedSources = computed(() => preferences.value.order
    .map(id => DICTIONARY_SOURCES.find(source => source.id === id))
    .filter((source): source is typeof DICTIONARY_SOURCES[number] => !!source));
  const enabledSources = computed(() => orderedSources.value
    .filter(source => !preferences.value.hidden.includes(source.id)));

  function setPreferredSource(id: DictionarySourceId): void {
    updatePreferences({ ...preferences.value, preferredSource: id, hidden: preferences.value.hidden.filter(item => item !== id) });
  }

  function setSourceEnabled(id: DictionarySourceId, enabled: boolean): boolean {
    const nextHidden = enabled
      ? preferences.value.hidden.filter(item => item !== id)
      : Array.from(new Set([...preferences.value.hidden, id]));
    if (nextHidden.length === sourceIds.length) return false;
    updatePreferences({ ...preferences.value, hidden: nextHidden });
    return true;
  }

  function moveSource(id: DictionarySourceId, direction: -1 | 1): void {
    const order = [...preferences.value.order];
    const position = order.indexOf(id);
    const target = position + direction;
    if (position < 0 || target < 0 || target >= order.length) return;
    [order[position], order[target]] = [order[target], order[position]];
    updatePreferences({ ...preferences.value, order });
  }

  return {
    preferences: readonly(preferences),
    savedLocally: readonly(savedLocally),
    orderedSources,
    enabledSources,
    setPreferredSource,
    setSourceEnabled,
    moveSource,
    resetPreferences: () => updatePreferences(normalizeDictionaryPreferences(null)),
  };
}

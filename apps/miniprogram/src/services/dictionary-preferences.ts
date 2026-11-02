import { computed, reactive } from 'vue';
import { UniStorageAdapter } from '../adapters/storage';
import type { StorageAdapter } from '../adapters/types';
import { DICTIONARY_SOURCES, type DictionarySourceId } from './dictionary-comparison';

export interface DictionaryPreferences { order: DictionarySourceId[]; hidden: DictionarySourceId[]; preferredSource: DictionarySourceId }
export const MINI_DICTIONARY_PREFERENCES_KEY = 'kotobud.miniprogram.dictionary.preferences.v1';
const ids = DICTIONARY_SOURCES.map(source => source.id);
const isId = (value: unknown): value is DictionarySourceId => typeof value === 'string' && ids.includes(value as DictionarySourceId);

export function normalizeDictionaryPreferences(raw: unknown): DictionaryPreferences {
  const input = raw && typeof raw === 'object' ? raw as Partial<DictionaryPreferences> : {};
  const order = [...new Set(Array.isArray(input.order) ? input.order.filter(isId) : [])];
  for (const id of ids) if (!order.includes(id)) order.push(id);
  let hidden = [...new Set(Array.isArray(input.hidden) ? input.hidden.filter(isId) : [])];
  if (hidden.length === ids.length) hidden = hidden.filter(id => id !== order[0]);
  const preferredSource = isId(input.preferredSource) && !hidden.includes(input.preferredSource)
    ? input.preferredSource : order.find(id => !hidden.includes(id))!;
  return { order, hidden, preferredSource };
}

export function createMiniDictionaryPreferences(storage: Pick<StorageAdapter, 'getItem' | 'setItem'>) {
  const state = reactive({ preferences: normalizeDictionaryPreferences(null), ready: false });
  let loading: Promise<void> | undefined;
  let revision = 0;
  async function load() {
    if (state.ready) return;
    if (loading) return loading;
    const startedRevision = revision;
    loading = (async () => {
      try {
        const raw = await storage.getItem(MINI_DICTIONARY_PREFERENCES_KEY);
        if (revision === startedRevision) state.preferences = normalizeDictionaryPreferences(raw ? JSON.parse(raw) : null);
      } catch { /* Defaults remain usable if settings have not been saved. */ }
      finally { state.ready = true; }
    })().finally(() => { loading = undefined; });
    return loading;
  }
  async function update(value: DictionaryPreferences) {
    const next = normalizeDictionaryPreferences(value);
    await storage.setItem(MINI_DICTIONARY_PREFERENCES_KEY, JSON.stringify(next));
    revision++;
    state.preferences = next;
    state.ready = true;
  }
  async function setPreferred(id: DictionarySourceId) {
    await update({ ...state.preferences, preferredSource: id, hidden: state.preferences.hidden.filter(source => source !== id) });
  }
  async function setEnabled(id: DictionarySourceId, enabled: boolean): Promise<boolean> {
    const hidden = enabled ? state.preferences.hidden.filter(source => source !== id) : [...new Set([...state.preferences.hidden, id])];
    if (hidden.length === ids.length) return false;
    await update({ ...state.preferences, hidden });
    return true;
  }
  async function move(id: DictionarySourceId, direction: -1 | 1) {
    const order = [...state.preferences.order];
    const current = order.indexOf(id);
    const target = current + direction;
    if (current < 0 || target < 0 || target >= order.length) return;
    [order[current], order[target]] = [order[target], order[current]];
    await update({ ...state.preferences, order });
  }
  const orderedSources = computed(() => state.preferences.order.map(id => DICTIONARY_SOURCES.find(source => source.id === id)!));
  const enabledSources = computed(() => orderedSources.value.filter(source => !state.preferences.hidden.includes(source.id)));
  return { state, orderedSources, enabledSources, load, setPreferred, setEnabled, move };
}

export const miniDictionaryPreferences = createMiniDictionaryPreferences(new UniStorageAdapter());

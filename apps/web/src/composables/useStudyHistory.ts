import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';

interface StudyHistoryContext<T> {
  queue: () => T[];
  index: () => number;
  accountId: () => string | null;
  busy: () => boolean;
  now?: () => number;
}

/** Page-local viewing history. The learning cursor and persisted ratings stay separate. */
export function useStudyHistory<T>(context: StudyHistoryContext<T>) {
  const entries = shallowRef<{ word: T; index: number }[]>([]);
  const reviewIndex = ref<number | null>(null);
  const pending = ref(false);
  const invalidated = ref(false);
  const clock = context.now ?? Date.now;
  let generation = 0;
  let reviewStartedAt: number | null = null;

  const reviewing = computed(() => reviewIndex.value !== null);
  const busy = computed(() => context.busy() || pending.value);
  const currentWord = computed(() => invalidated.value ? undefined : context.queue()[context.index()]);
  const reviewEntry = computed(() => reviewIndex.value === null ? undefined : entries.value[reviewIndex.value]);
  const word = computed(() => reviewing.value ? reviewEntry.value?.word : currentWord.value);
  const canPrevious = computed(() => !busy.value && !invalidated.value &&
    (reviewIndex.value === null ? entries.value.length > 0 : reviewIndex.value > 0));

  function clear(accountChanged = false) {
    generation++;
    entries.value = [];
    reviewIndex.value = null;
    reviewStartedAt = null;
    pending.value = false;
    invalidated.value = accountChanged;
  }

  watch(context.queue, () => clear(), { flush: 'sync' });
  watch(context.accountId, () => clear(true), { flush: 'sync' });
  onScopeDispose(() => clear(true));

  async function advance(save: () => Promise<unknown>): Promise<boolean> {
    if (busy.value || reviewing.value || !currentWord.value) return false;
    const ticket = generation;
    const queue = context.queue();
    const accountId = context.accountId();
    const index = context.index();
    const completedWord = currentWord.value;
    pending.value = true;
    try {
      await save();
      if (ticket !== generation || accountId !== context.accountId() || queue !== context.queue() ||
        invalidated.value || context.index() !== index + 1) return false;
      entries.value = [...entries.value, { word: completedWord, index }];
      return true;
    } finally {
      if (ticket === generation) pending.value = false;
    }
  }

  function previous(): boolean {
    if (!canPrevious.value) return false;
    if (reviewIndex.value === null) {
      reviewStartedAt = clock();
      reviewIndex.value = entries.value.length - 1;
    } else {
      reviewIndex.value--;
    }
    return true;
  }

  /** Return the paused interval so the caller can preserve its current answer timer. */
  function resume(): number {
    if (busy.value || !reviewing.value) return 0;
    const pausedFor = reviewStartedAt === null ? 0 : Math.max(0, clock() - reviewStartedAt);
    reviewIndex.value = null;
    reviewStartedAt = null;
    return pausedFor;
  }

  return { entries, reviewing, reviewEntry, currentWord, word, busy, invalidated, canPrevious, advance, previous, resume };
}

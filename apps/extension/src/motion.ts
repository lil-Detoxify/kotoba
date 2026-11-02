import { nextTick, onActivated, onDeactivated, onMounted, onUnmounted, watch, type ComputedRef, type Ref } from 'vue';
import { gsap } from 'gsap';
import type { MotionMode } from './model';

/** Short, scoped motion for the side panel. Reduced motion always wins. */
export function useExtensionMotion(root: Ref<HTMLElement | null>, mode: ComputedRef<MotionMode>) {
  let viewContext: gsap.Context | undefined;
  let revealContext: gsap.Context | undefined;
  let mediaQuery: MediaQueryList | undefined;
  let sequence = 0;
  let active = true;

  function clearContexts() {
    sequence += 1;
    viewContext?.revert();
    revealContext?.revert();
    viewContext = undefined;
    revealContext = undefined;
  }

  function canAnimate() {
    return Boolean(
      active && root.value &&
        mode.value === 'standard' &&
        !mediaQuery?.matches &&
        document.visibilityState === 'visible',
    );
  }

  async function animateView() {
    const currentSequence = ++sequence;
    viewContext?.revert();
    revealContext?.revert();
    viewContext = undefined;
    revealContext = undefined;

    await nextTick();
    if (currentSequence !== sequence || !canAnimate() || !root.value) return;

    viewContext = gsap.context(() => {
      const elements = gsap.utils.toArray<HTMLElement>('[data-motion-enter]').filter(element => element.getClientRects().length > 0).slice(0, 8);
      if (!elements.length) return;
      gsap.from(elements, {
        autoAlpha: 0,
        y: 12,
        duration: 0.34,
        stagger: 0.035,
        ease: 'power2.out',
        clearProps: 'all',
      });
    }, root.value);
  }

  async function animateReveal() {
    revealContext?.revert();
    revealContext = undefined;
    await nextTick();
    if (!canAnimate() || !root.value) return;

    revealContext = gsap.context(() => {
      const answer = gsap.utils.toArray<HTMLElement>('[data-motion-reveal]').filter(element => element.getClientRects().length > 0).slice(0, 1);
      if (!answer.length) return;
      gsap.from(answer, {
        autoAlpha: 0,
        y: 10,
        duration: 0.28,
        ease: 'power2.out',
        clearProps: 'all',
      });
    }, root.value);
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      clearContexts();
      return;
    }
    void animateView();
  }

  function handleMotionPreferenceChange() {
    if (mediaQuery?.matches || mode.value === 'reduced') {
      clearContexts();
      return;
    }
    void animateView();
  }

  watch(mode, handleMotionPreferenceChange);

  onDeactivated(() => { active = false; clearContexts(); });
  onActivated(() => { active = true; void animateView(); });

  onMounted(() => {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQuery.addEventListener('change', handleMotionPreferenceChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void animateView();
  });

  onUnmounted(() => {
    mediaQuery?.removeEventListener('change', handleMotionPreferenceChange);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearContexts();
  });

  return { animateView, animateReveal };
}

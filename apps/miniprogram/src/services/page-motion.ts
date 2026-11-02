import { computed, inject, provide, ref, type InjectionKey, type Ref } from "vue";
import { onHide, onShow, onUnload } from "@dcloudio/uni-app";
import { miniUi } from "./ui-preferences";

const PAGE_ACTIVE: InjectionKey<Ref<boolean>> = Symbol("mini-page-active");
// Register in the page's setup so the hooks belong to the native page.
export function useMiniPageActivity() {
  const active = ref(true);
  provide(PAGE_ACTIVE, active);
  onShow(() => { active.value = true; });
  onHide(() => { active.value = false; });
  onUnload(() => { active.value = false; });
  return active;
}
export function useMiniMotionAllowed() {
  const active = inject(PAGE_ACTIVE, ref(true));
  return computed(() => active.value && miniUi.state.foreground && miniUi.state.ready && miniUi.state.mode === "standard");
}
export function useMiniPageActive() { return inject(PAGE_ACTIVE, ref(true)); }

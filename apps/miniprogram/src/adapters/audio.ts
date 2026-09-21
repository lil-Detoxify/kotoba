import type { AudioAdapter, AudioPlayOptions } from "./types";

type AudioContextLike = {
  src?: string;
  playbackRate?: number;
  play: () => void;
  stop: () => void;
  destroy?: () => void;
  onEnded: (callback: () => void) => void;
  onError: (callback: (error: unknown) => void) => void;
  offEnded?: (callback: () => void) => void;
  offError?: (callback: (error: unknown) => void) => void;
};

type PendingPlay = {
  id: number;
  resolve: (result: boolean) => void;
  onEnded: () => void;
  onError: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** uni-app audio adapter with cancellable plays and page-lifecycle cleanup. */
export class UniAudioPlayer implements AudioAdapter {
  private innerAudioContext: AudioContextLike | null = null;
  private speaking = false;
  private nextPlayId = 0;
  private pending: PendingPlay | null = null;
  private destroyed = false;

  private initContext(): void {
    // @ts-ignore uni global supplied by uni-app at runtime
    if (typeof uni === "undefined" || typeof uni.createInnerAudioContext !== "function") return;
    // @ts-ignore uni global supplied by uni-app at runtime
    this.innerAudioContext = uni.createInnerAudioContext() as AudioContextLike;
    // @ts-ignore uni global supplied by uni-app at runtime
    if (typeof uni.setInnerAudioOption === "function") {
      // @ts-ignore uni global supplied by uni-app at runtime
      uni.setInnerAudioOption({ obeyMuteSwitch: false });
    }
  }

  async play(url: string, options: AudioPlayOptions = {}): Promise<boolean> {
    this.stop();
    if (this.destroyed || !url) return false;
    try {
      if (!this.innerAudioContext) this.initContext();
    } catch {
      return false;
    }
    const context = this.innerAudioContext;
    if (!context) return false;

    const id = ++this.nextPlayId;
    return new Promise<boolean>((resolve) => {
      const finish = (result: boolean, error?: unknown): void => {
        const pending = this.pending;
        if (!pending || pending.id !== id) return;
        clearTimeout(pending.timer);
        this.detach(pending);
        this.pending = null;
        this.speaking = false;
        resolve(result);
        // A failed load/play can leave the native context active even after
        // its error callback. Stop it after invalidating the request so a
        // synchronous native callback cannot re-enter this play.
        if (!result) this.stopNative(context);
        try {
          if (result) options.onEnded?.();
          else if (error !== undefined) options.onError?.(error);
        } catch {
          // Consumer callbacks must not turn a settled play into a rejected
          // native event or leave callers waiting for the Promise.
        }
      };
      const onEnded = (): void => finish(true);
      const onError = (error: unknown): void => finish(false, error);
      const pending: PendingPlay = {
        id,
        resolve,
        onEnded,
        onError,
        // A failed download can otherwise leave the page speaking forever
        // when a native runtime never emits error or ended.
        timer: setTimeout(() => finish(false, new Error("audio playback timed out")), 15_000)
      };
      this.pending = pending;
      this.speaking = true;
      try {
        context.onEnded(onEnded);
        context.onError(onError);
        context.src = url;
        context.playbackRate = options.slow ? 0.75 : 1;
        context.play();
      } catch (error) {
        finish(false, error);
      }
    });
  }

  stop(): void {
    const context = this.innerAudioContext;
    const pending = this.pending;
    this.pending = null;
    this.speaking = false;
    ++this.nextPlayId;
    if (pending) {
      clearTimeout(pending.timer);
      this.detach(pending);
      pending.resolve(false);
    }
    if (context && pending) this.stopNative(context);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    try {
      this.innerAudioContext?.destroy?.();
    } catch {
      // Ignore an already-released native context.
    }
    this.innerAudioContext = null;
    this.destroyed = true;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  private detach(pending: PendingPlay): void {
    const context = this.innerAudioContext;
    if (!context) return;
    try {
      context.offEnded?.(pending.onEnded);
      context.offError?.(pending.onError);
    } catch {
      // Older uni runtimes may not support removing listeners.
    }
  }

  private stopNative(context: AudioContextLike): void {
    try {
      context.stop();
    } catch {
      // The native context may already have been released.
    }
  }
}

/** Backward-compatible name used by Phase 1 adapter exports. */
export class UniAudioAdapter extends UniAudioPlayer {}

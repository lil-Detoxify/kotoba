import type { AudioAdapter, AudioPlayOptions } from "./types";
import type { AudioDiagnosticEventType } from "./audio-diagnostics";

export interface AudioDiagnosticNotice { playId: number; type: AudioDiagnosticEventType; }

type AudioContextLike = {
  src?: string;
  playbackRate?: number;
  volume?: number;
  play: () => void;
  stop: () => void;
  destroy?: () => void;
  onEnded: (callback: () => void) => void;
  onError: (callback: (error: unknown) => void) => void;
  onCanplay?: (callback: () => void) => void;
  onPlay?: (callback: () => void) => void;
  offEnded?: (callback: () => void) => void;
  offError?: (callback: (error: unknown) => void) => void;
  offCanplay?: (callback: () => void) => void;
  offPlay?: (callback: () => void) => void;
};

type PendingPlay = {
  id: number;
  resolve: (result: boolean) => void;
  onEnded: () => void;
  onError: (error: unknown) => void;
  onCanplay: () => void;
  onPlay: () => void;
  onInterrupted?: () => void;
  timer: ReturnType<typeof setTimeout>;
};

// Inner audio contexts are process-wide on mini-program runtimes. Keep one
// logical owner so two pages/components cannot speak over one another.
let focusedPlayer: UniAudioPlayer | null = null;

function acquireAudioFocus(player: UniAudioPlayer): void {
  if (focusedPlayer && focusedPlayer !== player) {
    focusedPlayer.stop(true);
  }
  focusedPlayer = player;
}

function releaseAudioFocus(player: UniAudioPlayer): void {
  if (focusedPlayer === player) {
    focusedPlayer = null;
  }
}

/** uni-app audio adapter with cancellable plays and page-lifecycle cleanup. */
export class UniAudioPlayer implements AudioAdapter {
  private innerAudioContext: AudioContextLike | null = null;
  private speaking = false;
  private nextPlayId = 0;
  private pending: PendingPlay | null = null;
  private destroyed = false;

  constructor(private readonly onDiagnostic?: (notice: AudioDiagnosticNotice) => void) {}

  private diagnose(playId: number, type: AudioDiagnosticEventType): void {
    try { this.onDiagnostic?.({ playId, type }); } catch { /* Diagnostics must not affect playback. */ }
  }

  private initContext(): void {
    // @ts-ignore uni global supplied by uni-app at runtime
    if (typeof uni === "undefined" || typeof uni.createInnerAudioContext !== "function") {
      throw new Error("uni.createInnerAudioContext is unavailable");
    }
    // @ts-ignore uni global supplied by uni-app at runtime
    const context = uni.createInnerAudioContext() as AudioContextLike | null;
    if (!context) throw new Error("uni.createInnerAudioContext returned no context");
    this.innerAudioContext = context;
    // @ts-ignore uni global supplied by uni-app at runtime
    if (typeof uni.setInnerAudioOption === "function") {
      try {
        // @ts-ignore uni global supplied by uni-app at runtime
        void Promise.resolve(uni.setInnerAudioOption({ obeyMuteSwitch: false })).catch(() => undefined);
      } catch {
        // A failed global option must not prevent otherwise valid playback.
      }
    }
  }

  private reportError(options: AudioPlayOptions, error: unknown): void {
    try { options.onError?.(error); } catch { /* Consumer callbacks must not break playback cleanup. */ }
  }

  async play(url: string, options: AudioPlayOptions = {}): Promise<boolean> {
    this.stop();
    const id = ++this.nextPlayId;
    if (this.destroyed || !url) {
      const error = new Error(this.destroyed ? "Audio player has been destroyed" : "Audio source is empty");
      this.diagnose(id, "error");
      this.reportError(options, error);
      return false;
    }
    try {
      if (!this.innerAudioContext) {
        this.diagnose(id, "contextCreateStart");
        this.initContext();
        if (this.innerAudioContext) this.diagnose(id, "contextCreateReady");
      }
    } catch (error) {
      this.diagnose(id, "error");
      this.reportError(options, error);
      return false;
    }
    const context = this.innerAudioContext;
    if (!context) {
      const error = new Error("Audio context is unavailable");
      this.diagnose(id, "error");
      this.reportError(options, error);
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const finish = (result: boolean, error?: unknown): void => {
        const pending = this.pending;
        if (!pending || pending.id !== id) return;
        this.diagnose(id, result ? "ended" : "error");
        clearTimeout(pending.timer);
        this.detach(pending);
        this.pending = null;
        this.speaking = false;
        releaseAudioFocus(this);
        resolve(result);
        // Failed native contexts can remain unusable after an error (including
        // platform-specific -99 failures). Release them so the next play gets
        // a clean context, after invalidating callbacks above.
        if (!result) this.releaseNativeContext(context);
        try {
          if (result) options.onEnded?.();
          else if (error !== undefined) this.reportError(options, error);
        } catch {
          // Consumer callbacks must not turn a settled play into a rejected
          // native event or leave callers waiting for the Promise.
        }
      };
      const onEnded = (): void => finish(true);
      const onError = (error: unknown): void => finish(false, error);
      const onCanplay = (): void => { if (this.pending?.id === id) this.diagnose(id, "canplay"); };
      const onPlay = (): void => { if (this.pending?.id === id) this.diagnose(id, "playEvent"); };
      const pending: PendingPlay = {
        id,
        resolve,
        onEnded,
        onError,
        onCanplay,
        onPlay,
        onInterrupted: options.onInterrupted,
        // A failed download can otherwise leave the page speaking forever
        // when a native runtime never emits error or ended.
        timer: setTimeout(() => finish(false, new Error("audio playback timed out")), 15_000)
      };
      acquireAudioFocus(this);
      this.pending = pending;
      this.speaking = true;
      try {
        context.onEnded(onEnded);
        context.onError(onError);
        context.onCanplay?.(onCanplay);
        context.onPlay?.(onPlay);
        context.src = url;
        this.diagnose(id, "srcAssigned");
        context.playbackRate = options.slow ? 0.75 : 1;
        context.volume = typeof options.volume === "number" && Number.isFinite(options.volume)
          ? Math.min(1, Math.max(0, options.volume))
          : 1;
        this.diagnose(id, "playCalled");
        context.play();
      } catch (error) {
        finish(false, error);
      }
    });
  }

  stop(interrupted = false): void {
    const context = this.innerAudioContext;
    const pending = this.pending;
    this.pending = null;
    this.speaking = false;
    ++this.nextPlayId;
    if (pending) {
      clearTimeout(pending.timer);
      this.detach(pending);
      if (interrupted) {
        try { pending.onInterrupted?.(); } catch { /* Consumer cleanup is best effort. */ }
      }
      pending.resolve(false);
    }
    if (context && pending) this.stopNative(context);
    releaseAudioFocus(this);
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
      context.offCanplay?.(pending.onCanplay);
      context.offPlay?.(pending.onPlay);
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

  private releaseNativeContext(context: AudioContextLike): void {
    if (this.innerAudioContext === context) this.innerAudioContext = null;
    this.stopNative(context);
    try {
      context.destroy?.();
    } catch {
      // Ignore a context that has already been released by the native runtime.
    }
  }
}

/** Backward-compatible name used by Phase 1 adapter exports. */
export class UniAudioAdapter extends UniAudioPlayer {}

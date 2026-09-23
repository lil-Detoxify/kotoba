import type { AudioAdapter, AudioPlayOptions } from "./types";
import type { AudioDiagnosticEventType } from "./audio-diagnostics";

export interface AudioDiagnosticNotice { playId: number; type: AudioDiagnosticEventType; }

type AudioContextLike = {
  src?: string;
  playbackRate?: number;
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
    const id = ++this.nextPlayId;
    try {
      if (!this.innerAudioContext) {
        this.diagnose(id, "contextCreateStart");
        this.initContext();
        if (this.innerAudioContext) this.diagnose(id, "contextCreateReady");
      }
    } catch {
      this.diagnose(id, "error");
      return false;
    }
    const context = this.innerAudioContext;
    if (!context) { this.diagnose(id, "error"); return false; }

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
}

/** Backward-compatible name used by Phase 1 adapter exports. */
export class UniAudioAdapter extends UniAudioPlayer {}

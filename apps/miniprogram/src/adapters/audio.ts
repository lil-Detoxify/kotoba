import type { AudioAdapter, AudioPlayOptions } from "./types";

export class UniAudioAdapter implements AudioAdapter {
  private innerAudioContext: any = null;
  private speaking = false;

  constructor() {
    this.initContext();
  }

  private initContext() {
    // @ts-ignore uni global
    if (typeof uni !== "undefined" && uni.createInnerAudioContext) {
      // @ts-ignore
      this.innerAudioContext = uni.createInnerAudioContext();
      // Ensure playback works even if device hardware mute switch is on
      // @ts-ignore
      if (uni.setInnerAudioOption) {
        // @ts-ignore
        uni.setInnerAudioOption({ obeyMuteSwitch: false });
      }
    }
  }

  async play(url: string, options: AudioPlayOptions = {}): Promise<boolean> {
    this.stop();
    if (!url || !this.innerAudioContext) return false;

    this.speaking = true;
    return new Promise<boolean>((resolve) => {
      this.innerAudioContext.src = url;
      this.innerAudioContext.playbackRate = options.slow ? 0.75 : 1.0;

      this.innerAudioContext.onEnded(() => {
        this.speaking = false;
        if (options.onEnded) options.onEnded();
        resolve(true);
      });

      this.innerAudioContext.onError((err: any) => {
        this.speaking = false;
        console.warn("[UniAudioAdapter] playback error:", err);
        if (options.onError) options.onError(err);
        resolve(false);
      });

      this.innerAudioContext.play();
    });
  }

  stop(): void {
    if (this.innerAudioContext && this.speaking) {
      try {
        this.innerAudioContext.stop();
      } catch {}
      this.speaking = false;
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

import type { AudioCacheCancellation, AudioCacheResolveOptions, AudioDownloadDiagnosticEvent } from "./audio-cache";
import type { UniAudioCache } from "./audio-cache";

export interface AudioPreloaderOptions {
  onDiagnostic?: (event: AudioDownloadDiagnosticEvent) => void;
}

type WarmableAudioCache = Pick<UniAudioCache, "warm" | "cancelWarm">;

/** Sequential, cancellable warmer for the current word and its next two words. */
export class AudioPreloader {
  private queue: string[] = [];
  private activeUrl?: string;
  private cancellation?: CancellationSource;
  private pumping = false;

  constructor(private readonly cache: WarmableAudioCache, private readonly options: AudioPreloaderOptions = {}) {}

  /** Replace the pending three-word set. Duplicate URLs are downloaded only once. */
  schedule(urls: string[]): void {
    const nextUrls = [...new Set(urls.filter((url) => typeof url === "string" && url.length > 0))].slice(0, 3);
    // Advancing to the next card commonly makes the active prefetch its current
    // word. Keep that useful download instead of restarting the same request.
    if (this.activeUrl && !nextUrls.includes(this.activeUrl)) this.cancellation?.abort();
    this.queue = nextUrls.filter((url) => url !== this.activeUrl);
    if (!this.pumping) void this.drain();
  }

  /** Drop queued words and abort the active uni.downloadFile request. */
  cancel(): void {
    this.queue = [];
    this.cancellation?.abort();
    if (this.activeUrl) this.cache.cancelWarm(this.activeUrl);
  }

  isActive(url: string): boolean { return this.activeUrl === url; }

  private async drain(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const url = this.queue.shift()!;
        this.activeUrl = url;
        const cancellation = new CancellationSource();
        this.cancellation = cancellation;
        const options: AudioCacheResolveOptions = {
          cancellation,
          onDiagnostic: (event) => {
            try { this.options.onDiagnostic?.(event); } catch { /* Diagnostics cannot interrupt preloading. */ }
          },
        };
        try {
          await this.cache.warm(url, options);
        } catch {
          // A prefetch is best effort; continue through the latest word set.
        } finally {
          if (this.cancellation === cancellation) this.cancellation = undefined;
          if (this.activeUrl === url) this.activeUrl = undefined;
        }
      }
    } finally {
      this.pumping = false;
      // A schedule may have replaced the queue as the previous request settled.
      if (this.queue.length) void this.drain();
    }
  }
}

class CancellationSource implements AudioCacheCancellation {
  private isAborted = false;
  private readonly listeners = new Set<() => void>();

  get aborted(): boolean { return this.isAborted; }

  onAbort(callback: () => void): () => void {
    if (this.isAborted) { callback(); return () => undefined; }
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  abort(): void {
    if (this.isAborted) return;
    this.isAborted = true;
    for (const listener of [...this.listeners]) listener();
    this.listeners.clear();
  }
}

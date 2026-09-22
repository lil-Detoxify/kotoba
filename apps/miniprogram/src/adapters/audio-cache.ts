import type { StorageAdapter } from "./types";
import { UniStorageAdapter } from "./storage";

export const AUDIO_CACHE_KEY = "audio_cache_manifest_v1";
export const DEFAULT_AUDIO_CACHE_MAX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_AUDIO_CACHE_MAX_ENTRIES = 100;

export interface AudioCacheDownloadResult {
  statusCode: number;
  tempFilePath: string;
}

export interface AudioCacheFileInfo {
  size: number;
}

/** The small surface used by the cache. The default implementation is backed
 * by uni's mini-program download and saved-file APIs; tests can inject a
 * deterministic driver without installing a native uni runtime. */
export interface AudioCacheDriver {
  downloadFile(url: string): Promise<AudioCacheDownloadResult>;
  saveFile(tempFilePath: string): Promise<string>;
  getFileInfo(filePath: string): Promise<AudioCacheFileInfo>;
  removeSavedFile(filePath: string): Promise<void>;
}

export interface AudioCacheEntry {
  url: string;
  localPath: string;
  size: number;
  lastUsedAt: number;
}

interface AudioCacheManifest {
  version: 1;
  entries: AudioCacheEntry[];
}

interface AudioCacheOptions {
  storage?: StorageAdapter;
  driver?: AudioCacheDriver;
  maxBytes?: number;
  maxEntries?: number;
  now?: () => number;
}

type UniAudioCacheRuntime = {
  downloadFile?: (options: {
    url: string;
    success?: (result: { statusCode?: unknown; tempFilePath?: unknown }) => void;
    fail?: (error: unknown) => void;
  }) => void;
  saveFile?: (options: {
    tempFilePath: string;
    success?: (result: { savedFilePath?: unknown }) => void;
    fail?: (error: unknown) => void;
  }) => void;
  getFileInfo?: (options: {
    filePath: string;
    success?: (result: { size?: unknown }) => void;
    fail?: (error: unknown) => void;
  }) => void;
  removeSavedFile?: (options: {
    filePath: string;
    success?: () => void;
    fail?: (error: unknown) => void;
  }) => void;
};

/**
 * A bounded cache for remote pronunciation files.
 *
 * A cache failure is deliberately treated as a playback concern: callers get
 * the original CDN URL when a download, file validation, or metadata write
 * fails. Learning data is never read or deleted by this class.
 */
export class UniAudioCache {
  private readonly storage: StorageAdapter;
  private readonly driver: AudioCacheDriver;
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly inFlight = new Map<string, Promise<string>>();
  private manifestLoad?: Promise<AudioCacheManifest>;
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private generation = 0;

  constructor(options: AudioCacheOptions = {}) {
    this.storage = options.storage ?? new UniStorageAdapter();
    this.driver = options.driver ?? createUniAudioCacheDriver();
    this.maxBytes = positiveInteger(options.maxBytes, DEFAULT_AUDIO_CACHE_MAX_BYTES);
    this.maxEntries = positiveInteger(options.maxEntries, DEFAULT_AUDIO_CACHE_MAX_ENTRIES);
    this.now = options.now ?? (() => Date.now());
  }

  /** Resolve a URL to a local saved-file path when possible. */
  async resolve(url: string): Promise<string> {
    if (!isRemoteUrl(url)) return url;
    const existing = this.inFlight.get(url);
    if (existing) return existing;
    const operation = this.resolveRemote(url);
    this.inFlight.set(url, operation);
    try {
      return await operation;
    } finally {
      if (this.inFlight.get(url) === operation) this.inFlight.delete(url);
    }
  }

  /** Return a validated cached path without delaying playback for a download. */
  async getCached(url: string): Promise<string | undefined> {
    if (!isRemoteUrl(url)) return undefined;
    try { return await this.touch(url); }
    catch { return undefined; }
  }

  /** Download a remote file for a later play while preserving CDN fallback. */
  async warm(url: string): Promise<void> {
    await this.resolve(url);
  }

  /** Remove one bad cache entry after the native decoder rejects it. */
  async invalidate(url: string): Promise<void> {
    if (!isRemoteUrl(url)) return;
    await this.enqueueMutation(async () => {
      const manifest = await this.loadManifest();
      const entry = manifest.entries.find((candidate) => candidate.url === url);
      if (!entry) return;
      manifest.entries = manifest.entries.filter((candidate) => candidate !== entry);
      await this.persistManifest(manifest);
      await this.driver.removeSavedFile(entry.localPath).catch(() => undefined);
    });
  }

  /** Remove every file represented by the audio manifest and the manifest. */
  async clear(): Promise<void> {
    const generation = ++this.generation;
    await this.enqueueMutation(async () => {
      const manifest = await this.loadManifest();
      const paths = unique(manifest.entries.map((entry) => entry.localPath));
      await Promise.all(paths.map((path) => this.driver.removeSavedFile(path).catch(() => undefined)));
      if (generation === this.generation) await this.storage.removeItem(AUDIO_CACHE_KEY).catch(() => undefined);
      this.manifestLoad = Promise.resolve(emptyManifest());
    });
  }

  /** Exposed for diagnostics and deterministic tests; returns a safe copy. */
  async getEntries(): Promise<AudioCacheEntry[]> {
    return this.enqueueMutation(async () => (await this.loadManifest()).entries.map((entry) => ({ ...entry })));
  }

  private async resolveRemote(url: string): Promise<string> {
    let cached: string | undefined;
    try {
      cached = await this.touch(url);
    } catch {
      return url;
    }
    if (cached) return cached;

    const generation = this.generation;
    let savedPath = "";
    try {
      const downloaded = await this.driver.downloadFile(url);
      if (downloaded.statusCode !== 200 || !isSafePath(downloaded.tempFilePath)) throw new Error("Invalid audio download response");
      const candidatePath = await this.driver.saveFile(downloaded.tempFilePath);
      if (!isSafePath(candidatePath)) throw new Error("Invalid saved audio path");
      savedPath = candidatePath;
      const info = await this.driver.getFileInfo(savedPath);
      if (!isValidSize(info.size) || info.size > this.maxBytes) throw new Error("Invalid audio file size");
      if (generation !== this.generation) throw new Error("Audio cache was cleared during download");

      await this.enqueueMutation(async () => {
        const manifest = await this.loadManifest();
        const previous = manifest.entries.find((entry) => entry.url === url);
        if (previous && previous.localPath !== savedPath) await this.driver.removeSavedFile(previous.localPath).catch(() => undefined);
        manifest.entries = manifest.entries.filter((entry) => entry.url !== url && entry.localPath !== savedPath);
        manifest.entries.push({ url, localPath: savedPath, size: info.size, lastUsedAt: this.freshTimestamp(manifest) });
        await this.evictAndPersist(manifest);
      });
      return savedPath;
    } catch {
      if (savedPath) await this.driver.removeSavedFile(savedPath).catch(() => undefined);
      return url;
    }
  }

  private async touch(url: string): Promise<string | undefined> {
    return this.enqueueMutation(async () => {
      const manifest = await this.loadManifest();
      const entry = manifest.entries.find((candidate) => candidate.url === url);
      if (!entry) return undefined;
      try {
        const info = await this.driver.getFileInfo(entry.localPath);
        if (!isValidSize(info.size) || info.size !== entry.size) throw new Error("Cached audio size mismatch");
      } catch {
        manifest.entries = manifest.entries.filter((candidate) => candidate !== entry);
        await this.persistManifest(manifest);
        await this.driver.removeSavedFile(entry.localPath).catch(() => undefined);
        return undefined;
      }
      entry.lastUsedAt = this.freshTimestamp(manifest, entry);
      await this.persistManifest(manifest);
      return entry.localPath;
    });
  }

  private async loadManifest(): Promise<AudioCacheManifest> {
    if (!this.manifestLoad) {
      this.manifestLoad = this.storage.getItem(AUDIO_CACHE_KEY).then((raw) => parseManifest(raw));
    }
    return this.manifestLoad;
  }

  private async persistManifest(manifest: AudioCacheManifest): Promise<void> {
    await this.storage.setItem(AUDIO_CACHE_KEY, JSON.stringify(manifest));
  }

  private async evictAndPersist(manifest: AudioCacheManifest): Promise<void> {
    manifest.entries.sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.url.localeCompare(b.url));
    let total = manifest.entries.reduce((sum, entry) => sum + entry.size, 0);
    while (manifest.entries.length > this.maxEntries || total > this.maxBytes) {
      const evicted = manifest.entries.shift();
      if (!evicted) break;
      total -= evicted.size;
      await this.driver.removeSavedFile(evicted.localPath).catch(() => undefined);
    }
    await this.persistManifest(manifest);
  }

  private freshTimestamp(manifest: AudioCacheManifest, excluding?: AudioCacheEntry): number {
    const current = this.now();
    const latest = manifest.entries.reduce((max, entry) => entry === excluding ? max : Math.max(max, entry.lastUsedAt), 0);
    return Math.max(current, latest + 1);
  }

  private async enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
    const operation = this.mutationQueue.then(task);
    this.mutationQueue = operation.catch(() => undefined);
    return operation;
  }
}

function emptyManifest(): AudioCacheManifest {
  return { version: 1, entries: [] };
}

function parseManifest(raw: string | null): AudioCacheManifest {
  if (!raw) return emptyManifest();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyManifest();
    const value = parsed as { version?: unknown; entries?: unknown };
    if (value.version !== 1 || !Array.isArray(value.entries)) return emptyManifest();
    const entries = value.entries.filter(isAudioCacheEntry).map((entry) => ({ ...entry }));
    return { version: 1, entries };
  } catch {
    return emptyManifest();
  }
}

function isAudioCacheEntry(value: unknown): value is AudioCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Partial<AudioCacheEntry>;
  return isRemoteUrl(entry.url) && isSafePath(entry.localPath) && isValidSize(entry.size) && typeof entry.lastUsedAt === "number" && Number.isFinite(entry.lastUsedAt) && entry.lastUsedAt >= 0;
}

function isRemoteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https:\/\/[^\s]+$/i.test(value);
}

function isSafePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || value.includes("\0")) return false;
  if (value.split(/[\\/]+/).some((segment) => segment === "..")) return false;
  return value.startsWith("/") || /^(?:wxfile|file):\/\//i.test(value) || value.startsWith("_doc/");
}

function isValidSize(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function createUniAudioCacheDriver(): AudioCacheDriver {
  const runtime = getUniAudioCacheRuntime();
  return {
    downloadFile: (url) => new Promise((resolve, reject) => {
      if (!runtime?.downloadFile) return reject(new Error("uni.downloadFile unavailable"));
      runtime.downloadFile({
        url,
        success: (result) => resolve({ statusCode: Number(result.statusCode), tempFilePath: String(result.tempFilePath ?? "") }),
        fail: reject,
      });
    }),
    saveFile: (tempFilePath) => new Promise((resolve, reject) => {
      if (!runtime?.saveFile) return reject(new Error("uni.saveFile unavailable"));
      runtime.saveFile({ tempFilePath, success: (result) => resolve(String(result.savedFilePath ?? "")), fail: reject });
    }),
    getFileInfo: (filePath) => new Promise((resolve, reject) => {
      if (!runtime?.getFileInfo) return reject(new Error("uni.getFileInfo unavailable"));
      runtime.getFileInfo({ filePath, success: (result) => resolve({ size: Number(result.size) }), fail: reject });
    }),
    removeSavedFile: (filePath) => new Promise((resolve, reject) => {
      if (!runtime?.removeSavedFile) return reject(new Error("uni.removeSavedFile unavailable"));
      runtime.removeSavedFile({ filePath, success: resolve, fail: reject });
    }),
  };
}

function getUniAudioCacheRuntime(): UniAudioCacheRuntime | undefined {
  return typeof uni === "undefined" ? undefined : uni as unknown as UniAudioCacheRuntime;
}

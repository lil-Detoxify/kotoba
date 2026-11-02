import { reactive } from "vue";
import { UniAudioPlayer } from "../adapters/audio";
import { UniStorageAdapter } from "../adapters/storage";
import type { AudioAdapter, StorageAdapter } from "../adapters/types";
import { miniAnswerSoundSource } from "./answer-sound-source";
import type { AnswerSoundSource } from "./answer-sound-source";

export type AnswerSoundScheme = "wood" | "chime" | "timber" | "stone";

export const ANSWER_SOUND_OPTIONS = [
  { id: "wood", name: "木芽", description: "圆润的木质轻敲" },
  { id: "chime", name: "风铃", description: "轻柔的短钟余韵" },
  { id: "timber", name: "林木", description: "温厚、干燥的木声" },
  { id: "stone", name: "溪石", description: "清脆、柔化的石声" },
] as const satisfies readonly { id: AnswerSoundScheme; name: string; description: string }[];

export interface MiniAnswerSoundState {
  enabled: boolean;
  scheme: AnswerSoundScheme;
  volume: number;
  ready: boolean;
  playbackError: string;
}

export interface MiniAnswerSound {
  state: MiniAnswerSoundState;
  load(): Promise<void>;
  setEnabled(value: boolean): Promise<void>;
  setScheme(value: AnswerSoundScheme): Promise<void>;
  setVolume(value: number): Promise<void>;
  play(correct: boolean): Promise<boolean>;
  preview(correct: boolean): Promise<boolean>;
  stop(): void;
  setForeground(value: boolean): void;
}

export interface MiniAnswerSoundOptions {
  storage?: Pick<StorageAdapter, "getItem" | "setItem">;
  player?: AudioAdapter;
  source?: AnswerSoundSource;
}

const STORAGE_KEY = "kotobud.miniprogram.answer-sound.v1";
const DEFAULT_ENABLED = true;
const DEFAULT_SCHEME: AnswerSoundScheme = "wood";
const DEFAULT_VOLUME = 0.45;

const SOUND_URLS: Record<AnswerSoundScheme, { correct: string; incorrect: string }> = {
  wood: {
    correct: "/static/answer-sounds/wood-correct.wav",
    incorrect: "/static/answer-sounds/wood-incorrect.wav",
  },
  chime: {
    correct: "/static/answer-sounds/chime-correct.wav",
    incorrect: "/static/answer-sounds/chime-incorrect.wav",
  },
  timber: {
    correct: "/static/answer-sounds/timber-correct.wav",
    incorrect: "/static/answer-sounds/timber-incorrect.wav",
  },
  stone: {
    correct: "/static/answer-sounds/stone-correct.wav",
    incorrect: "/static/answer-sounds/stone-incorrect.wav",
  },
};

function isAnswerSoundScheme(value: unknown): value is AnswerSoundScheme {
  return value === "wood" || value === "chime" || value === "timber" || value === "stone";
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function asPreferenceRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function playbackErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" ? (error as { errCode?: unknown }).errCode : undefined;
  const messages: Record<string, string> = {
    "10001": "系统音频暂不可用，请重试",
    "10002": "提示音网络连接失败，请检查网络后重试",
    "10003": "提示音文件读取失败，请重试",
    "10004": "设备未能解码提示音，请重试",
    "-99": "音频播放器暂不可用，请重新试听",
  };
  if (typeof code === "number" || (typeof code === "string" && /^-?\d+$/.test(code))) {
    return `${messages[String(code)] || "提示音播放失败，请重试"}（${code}）。`;
  }
  return "提示音播放失败，请重试。";
}

/** Native mini-program answer feedback. Preferences live outside learning data and sync. */
export function createMiniAnswerSound(options: MiniAnswerSoundOptions = {}): MiniAnswerSound {
  const state = reactive<MiniAnswerSoundState>({
    enabled: DEFAULT_ENABLED,
    scheme: DEFAULT_SCHEME,
    volume: DEFAULT_VOLUME,
    ready: false,
    playbackError: "",
  });

  let storage = options.storage;
  let player = options.player;
  const source = options.source ?? miniAnswerSoundSource;
  let loadTask: Promise<void> | undefined;
  let persistenceTail: Promise<void> = Promise.resolve();
  let generation = 0;
  let foreground = true;
  const settingRevision = { enabled: 0, scheme: 0, volume: 0 };

  const getStorage = (): Pick<StorageAdapter, "getItem" | "setItem"> => {
    if (!storage) storage = new UniStorageAdapter();
    return storage;
  };

  const getPlayer = (): AudioAdapter => {
    // Construct the native player only when the first sound is requested.
    if (!player) player = new UniAudioPlayer();
    return player;
  };

  function stop(): void {
    generation += 1;
    try {
      player?.stop();
    } catch {
      // A native stop failure must never interrupt the study flow.
    }
  }

  function load(): Promise<void> {
    if (state.ready) return Promise.resolve();
    if (loadTask) return loadTask;

    const revisions = { ...settingRevision };
    const task = (async () => {
      const raw = await getStorage().getItem(STORAGE_KEY);
      let saved: Record<string, unknown> | null = null;
      if (raw) {
        try {
          saved = asPreferenceRecord(JSON.parse(raw) as unknown);
        } catch {
          // Invalid preference JSON is ignored; defaults remain usable.
        }
      }

      if (saved) {
        if (settingRevision.enabled === revisions.enabled && typeof saved.enabled === "boolean") {
          state.enabled = saved.enabled;
        }
        if (settingRevision.scheme === revisions.scheme && isAnswerSoundScheme(saved.scheme)) {
          state.scheme = saved.scheme;
        }
        if (settingRevision.volume === revisions.volume && typeof saved.volume === "number" && Number.isFinite(saved.volume)) {
          state.volume = clampVolume(saved.volume);
        }
      }
      state.ready = true;
    })();

    loadTask = task;
    void task.finally(() => {
      if (loadTask === task) loadTask = undefined;
    }).catch(() => undefined);
    return task;
  }

  async function persist(): Promise<void> {
    await load();
    const value = JSON.stringify({
      enabled: state.enabled,
      scheme: state.scheme,
      volume: state.volume,
    });
    const operation = persistenceTail.catch(() => undefined).then(async () => {
      await getStorage().setItem(STORAGE_KEY, value);
    });
    persistenceTail = operation;
    await operation;
  }

  function setEnabled(value: boolean): Promise<void> {
    if (typeof value !== "boolean") return Promise.resolve();
    settingRevision.enabled += 1;
    state.enabled = value;
    if (!value) stop();
    return persist();
  }

  function setScheme(value: AnswerSoundScheme): Promise<void> {
    if (!isAnswerSoundScheme(value)) return Promise.resolve();
    settingRevision.scheme += 1;
    if (state.scheme !== value) {
      state.scheme = value;
      stop();
    }
    return persist();
  }

  function setVolume(value: number): Promise<void> {
    if (typeof value !== "number" || !Number.isFinite(value)) return Promise.resolve();
    const volume = clampVolume(value);
    settingRevision.volume += 1;
    if (state.volume !== volume) {
      state.volume = volume;
      stop();
    }
    return persist();
  }

  async function playSound(correct: boolean, allowWhenDisabled: boolean): Promise<boolean> {
    const requestGeneration = generation;
    try {
      await load();
    } catch {
      return false;
    }
    if (requestGeneration !== generation || !foreground) return false;
    if ((!allowWhenDisabled && !state.enabled) || state.volume <= 0) return false;

    // A new answer sound replaces the previous one and owns its cancellation token.
    stop();
    const playGeneration = generation;
    state.playbackError = "";
    const path = SOUND_URLS[state.scheme][correct ? "correct" : "incorrect"];
    try {
      const url = await source.resolve(path);
      if (playGeneration !== generation || !foreground) return false;
      const played = await getPlayer().play(url, {
        volume: state.volume,
        onError: (error) => {
          if (playGeneration === generation) state.playbackError = playbackErrorMessage(error);
        },
      });
      if (!played && playGeneration === generation && !state.playbackError) {
        state.playbackError = "提示音播放失败，请重试。";
      }
      return played && playGeneration === generation && foreground;
    } catch (error) {
      if (playGeneration === generation) state.playbackError = playbackErrorMessage(error);
      return false;
    }
  }

  function setForeground(value: boolean): void {
    if (typeof value !== "boolean") return;
    if (foreground === value) return;
    foreground = value;
    if (!foreground) stop();
  }

  return {
    state,
    load,
    setEnabled,
    setScheme,
    setVolume,
    play: (correct) => playSound(correct, false),
    preview: (correct) => playSound(correct, true),
    stop,
    setForeground,
  };
}

export const miniAnswerSound = createMiniAnswerSound();

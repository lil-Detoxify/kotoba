import type { Data } from "@jp/models";
import type { AudioVoice } from "../adapters/audio-url";
import { defaultRepository } from "../adapters";
import type { MiniProgramRepositoryContract } from "../adapters/types";
import { settingsQueueItem } from "./sync-outbox";

/** The Web voice setting is an account preference, so persist and enqueue it. */
export function setPronunciationVoice(
  voice: AudioVoice,
  repository: MiniProgramRepositoryContract = defaultRepository,
): Promise<Data> {
  if (voice !== "female" && voice !== "male") return Promise.reject(new Error("发音类型无效"));
  const key = repository.getActiveKey();
  const change = (data: Data) => {
    data.userSettings = {
      ...(data.userSettings ?? { userId: "local" }),
      preferences: { ...data.userSettings?.preferences, pronunciationVoice: voice },
      updatedAt: new Date().toISOString(),
    };
  };
  if (repository.transactAndEnqueue) {
    return repository.transactAndEnqueue(change, (data) => data.userSettings ? [settingsQueueItem(data.userSettings)] : [], key);
  }
  return repository.transact(change, key);
}

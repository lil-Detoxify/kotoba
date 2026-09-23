import { describe, expect, it } from "vitest";
import { MiniProgramRepository, type StorageAdapter } from "../apps/miniprogram/src/adapters/storage";
import { setPronunciationVoice } from "../apps/miniprogram/src/services/pronunciation";

function storage(): StorageAdapter {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

describe("mini-program pronunciation preference", () => {
  it("persists Web-compatible voice IDs and enqueues settings for account sync", async () => {
    const backing = storage();
    const repository = new MiniProgramRepository(backing);
    await setPronunciationVoice("male", repository);
    expect((await repository.read()).userSettings?.preferences?.pronunciationVoice).toBe("male");
    expect((await repository.getQueue()).at(-1)).toMatchObject({ type: "settings", payload: { preferences: { pronunciationVoice: "male" } } });

    const reopened = new MiniProgramRepository(backing);
    expect((await reopened.read()).userSettings?.preferences?.pronunciationVoice).toBe("male");
    await setPronunciationVoice("female", reopened);
    expect((await reopened.read()).userSettings?.preferences?.pronunciationVoice).toBe("female");
    expect((await reopened.getQueue()).at(-1)).toMatchObject({ type: "settings", payload: { preferences: { pronunciationVoice: "female" } } });
  });
});

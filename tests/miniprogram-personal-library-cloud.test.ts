import { describe, expect, it, vi } from "vitest";
import type { HttpRequestOptions, NetworkAdapter } from "../apps/miniprogram/src/adapters/types";
import {
  createMiniPersonalLibraryCloudBackup,
  MiniPersonalLibraryCloudError,
} from "../apps/miniprogram/src/services/personal-library-cloud";
import type {
  ExistingContentPolicy,
  PersonalLibrary,
  PersonalLibraryMergeResult,
  PersonalLibraryPreview,
} from "../apps/miniprogram/src/services/personal-library";
import type { CloudBackup } from "../apps/web/src/services/personal-library-cloud";

const BACKUP_PATH = "/api/v1/personal-library/backup";

function library(term = "日本語"): PersonalLibrary {
  return {
    kind: "kotobud-personal-library",
    version: 1,
    exportedAt: "2026-10-14T02:00:00.000Z",
    books: [{
      id: "personal-book-1",
      title: "我的词书",
      description: "",
      language: "ja",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-14T00:00:00.000Z",
    }],
    lessons: [{ id: "personal-lesson-1", bookId: "personal-book-1", title: "第一课", order: 1 }],
    words: [{ id: "personal-word-1", lessonId: "personal-lesson-1", term, reading: "にほんご", meaning: "日语", order: 1 }],
    builtinContexts: [],
  };
}

function backup(revision = 4, value = library()): CloudBackup {
  return { revision, updatedAt: "2026-10-14T01:00:00.000Z", library: value };
}

interface HarnessOptions {
  remote?: CloudBackup | null;
  local?: PersonalLibrary;
  getError?: string;
  putError?: string;
  merge?: (value: PersonalLibrary, policy: ExistingContentPolicy, key?: string) => Promise<PersonalLibraryMergeResult>;
}

function harness(options: HarnessOptions = {}) {
  let activeKey = "data_user_alice";
  let remote = options.remote === undefined ? backup() : options.remote;
  const calls: Array<{ url: string; options?: HttpRequestOptions }> = [];
  const exportKeys: Array<string | undefined> = [];
  const session = { userId: "alice", token: "alice-token" };
  const local = options.local ?? library("本機詞條");
  const preview: PersonalLibraryPreview = {
    newBooks: 1, newLessons: 1, newWords: 2, existingWords: 0, newContexts: 1, existingContexts: 0,
  };
  const mergeResult: PersonalLibraryMergeResult = { ...preview, bookIds: ["personal-book-1"] };
  const network: NetworkAdapter = {
    async request<T>(url: string, requestOptions?: HttpRequestOptions): Promise<T> {
      calls.push({ url, options: requestOptions });
      if (requestOptions?.method === "PUT") {
        if (options.putError) throw new Error(options.putError);
        const body = requestOptions.data as { expectedRevision: number; library: PersonalLibrary };
        remote = backup(body.expectedRevision + 1, body.library);
        return { backup: remote } as T;
      }
      if (options.getError) throw new Error(options.getError);
      return { backup: remote } as T;
    },
  };
  const cloud = createMiniPersonalLibraryCloudBackup({
    auth: { getSession: async () => session },
    repository: { getActiveKey: () => activeKey },
    network,
    exportLibrary: async (key) => { exportKeys.push(key); return structuredClone(local); },
    previewLibrary: async () => preview,
    mergeLibrary: options.merge ?? (async () => mergeResult),
  });

  return {
    cloud,
    calls,
    exportKeys,
    local,
    preview,
    mergeResult,
    setActiveKey(key: string) { activeKey = key; },
  };
}

describe("Mini Program personal-library cloud backup", () => {
  it("manually views the matching account partition and uses the GET protocol", async () => {
    const setup = harness();
    const result = await setup.cloud.view();

    expect(setup.calls).toHaveLength(1);
    expect(setup.calls[0]).toMatchObject({
      url: BACKUP_PATH,
      options: { method: "GET", headers: { Authorization: "Bearer alice-token" } },
    });
    expect(setup.exportKeys).toEqual(["data_user_alice"]);
    expect(result.backup?.revision).toBe(4);
    expect(result.localLibrary.books).toHaveLength(1);
  });

  it("requires a manual view and sends the viewed revision in the PUT body", async () => {
    const setup = harness();
    await expect(setup.cloud.saveDeviceBackup()).rejects.toMatchObject({ code: "view_required" });
    expect(setup.calls).toHaveLength(0);

    await setup.cloud.view();
    await setup.cloud.saveDeviceBackup();
    const put = setup.calls[1];
    expect(put.url).toBe(BACKUP_PATH);
    expect(put.options).toMatchObject({
      method: "PUT",
      headers: { Authorization: "Bearer alice-token", "Content-Type": "application/json" },
      data: { expectedRevision: 4, library: setup.local },
    });
  });

  it("turns revision conflicts into a refresh requirement", async () => {
    const setup = harness({ putError: "backup_conflict" });
    await setup.cloud.view();
    let conflict: unknown;
    try { await setup.cloud.saveDeviceBackup(); } catch (error) { conflict = error; }
    expect(conflict).toBeInstanceOf(MiniPersonalLibraryCloudError);
    expect(conflict).toMatchObject({ code: "backup_conflict", status: 409 });
    expect((conflict as Error).message).toContain("重新查看");
    await expect(setup.cloud.saveDeviceBackup()).rejects.toMatchObject({ code: "view_required" });
  });

  it("counts UTF-8 bytes and refuses oversized content before sending PUT", async () => {
    const oversized = library("語".repeat(350_000));
    const setup = harness({ remote: null, local: oversized });
    await setup.cloud.view();
    await expect(setup.cloud.saveDeviceBackup()).rejects.toMatchObject({ code: "backup_too_large", status: 413 });
    expect(setup.calls.map((call) => call.options?.method ?? "GET")).toEqual(["GET"]);
  });

  it("maps service failures to a Chinese error without changing the local package", async () => {
    const setup = harness({ getError: "db_unavailable" });
    const before = structuredClone(setup.local);
    await expect(setup.cloud.view()).rejects.toMatchObject({ code: "backup_unavailable" });
    expect(setup.cloud.state.busy).toBe(false);
    expect(setup.local).toEqual(before);
    expect(setup.calls).toHaveLength(1);
  });

  it("requires a preview for the selected merge policy and refuses after an account switch", async () => {
    const localData = { words: ["local"], states: [{ wordId: "local-word", status: "learning" }], logs: ["review"] };
    const before = structuredClone(localData);
    const merge = vi.fn(async (_value: PersonalLibrary, _policy: ExistingContentPolicy, _key?: string) => {
      localData.words.push("cloud");
      return { newBooks: 0, newLessons: 0, newWords: 1, existingWords: 0, newContexts: 0, existingContexts: 0, bookIds: [] };
    });
    const setup = harness({ merge });
    await setup.cloud.view();
    await setup.cloud.previewRestore("keep-local");
    await expect(setup.cloud.mergeToDevice("use-package")).rejects.toMatchObject({ code: "preview_required" });
    expect(merge).not.toHaveBeenCalled();

    setup.setActiveKey("data_user_bob");
    await expect(setup.cloud.mergeToDevice("keep-local")).rejects.toMatchObject({ code: "account_changed" });
    expect(merge).not.toHaveBeenCalled();
    expect(localData).toEqual(before);

    setup.setActiveKey("data_user_alice");
    await setup.cloud.view();
    await setup.cloud.previewRestore("use-package");
    const result = await setup.cloud.mergeToDevice("use-package");
    expect(result.newWords).toBe(1);
    expect(merge).toHaveBeenCalledWith(expect.any(Object), "use-package", "data_user_alice");
    expect(localData.states).toEqual(before.states);
    expect(localData.logs).toEqual(before.logs);
  });
});

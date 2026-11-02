import { describe, expect, it, vi } from "vitest";
import {
  createMiniPersonalLibraryFileService,
  isMiniPersonalLibraryFileCancel,
  type MiniPersonalLibraryNativeFiles,
} from "../apps/miniprogram/src/services/personal-library-files";

function nativeFiles(overrides: Partial<MiniPersonalLibraryNativeFiles> = {}) {
  const driver: MiniPersonalLibraryNativeFiles = {
    userDataPath: "/sandbox/user",
    chooseMessageFile: vi.fn(async () => ({ name: "words.csv", path: "/tmp/import.csv" })),
    readFile: vi.fn(async () => "term,reading,meaning\n駅,えき,车站"),
    writeFile: vi.fn(async () => {}),
    shareFileMessage: vi.fn(async () => {}),
    now: () => new Date(2026, 9, 14, 12, 5, 6),
    ...overrides,
  };
  return driver;
}

describe("Mini personal library native file adapter", () => {
  it("chooses one CSV/JSON file and reads its UTF-8 contents for the existing preview flow", async () => {
    const files = nativeFiles();
    const service = createMiniPersonalLibraryFileService(files);

    await expect(service.chooseImportFile()).resolves.toEqual({
      name: "words.csv",
      path: "/tmp/import.csv",
      text: "term,reading,meaning\n駅,えき,车站",
    });
    expect(files.chooseMessageFile).toHaveBeenCalledWith({ count: 1, type: "file", extension: ["csv", "json"] });
    expect(files.readFile).toHaveBeenCalledWith("/tmp/import.csv");

    const canceledFiles = nativeFiles({ chooseMessageFile: vi.fn(async () => null) });
    await expect(createMiniPersonalLibraryFileService(canceledFiles).chooseImportFile()).resolves.toBeNull();
    expect(canceledFiles.readFile).not.toHaveBeenCalled();
  });

  it("writes JSON under USER_DATA_PATH and calls file sharing only when explicitly requested", async () => {
    const files = nativeFiles();
    const service = createMiniPersonalLibraryFileService(files);
    const json = "{\"kind\":\"kotobud-personal-library\"}";

    const saved = await service.saveExportFile(json);
    expect(saved).toEqual({ name: "KotoBud-personal-library-20261014-120506000.json", path: "/sandbox/user/KotoBud-personal-library-20261014-120506000.json" });
    expect(files.writeFile).toHaveBeenCalledWith(saved.path, json);
    expect(files.shareFileMessage).not.toHaveBeenCalled();

    await service.shareExportFile(saved);
    expect(files.shareFileMessage).toHaveBeenCalledWith(saved);

    const canceledShare = createMiniPersonalLibraryFileService(nativeFiles({
      shareFileMessage: vi.fn(async () => { throw new Error("shareFileMessage:fail cancel"); }),
    }));
    const canceledFile = await canceledShare.saveExportFile(json);
    await expect(canceledShare.shareExportFile(canceledFile)).rejects.toThrow(/cancel/u);
    expect(isMiniPersonalLibraryFileCancel(new Error("shareFileMessage:fail cancel"))).toBe(true);
  });
});

export interface ChosenPersonalLibraryImportFile {
  path: string;
  name: string;
}

export interface SavedPersonalLibraryExportFile {
  path: string;
  name: string;
}

export interface MiniPersonalLibraryNativeFiles {
  userDataPath: string;
  chooseMessageFile?: (options: { count: 1; type: "file"; extension: string[] }) => Promise<ChosenPersonalLibraryImportFile | null>;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, contents: string) => Promise<void>;
  shareFileMessage?: (file: SavedPersonalLibraryExportFile) => Promise<void>;
  now?: () => Date;
}

export interface MiniPersonalLibraryImportContents extends ChosenPersonalLibraryImportFile {
  text: string;
}

export function isMiniPersonalLibraryFileCancel(error: unknown): boolean {
  const message = typeof error === "string"
    ? error
    : error && typeof error === "object" && "errMsg" in error
      ? String((error as { errMsg?: unknown }).errMsg ?? "")
      : error instanceof Error ? error.message : String(error ?? "");
  return /(?:cancel|取消)/iu.test(message);
}

export function createMiniPersonalLibraryFileService(nativeFiles?: MiniPersonalLibraryNativeFiles) {
  const canImport = !!nativeFiles?.chooseMessageFile && !!nativeFiles.readFile;
  const canSave = !!nativeFiles?.userDataPath && !!nativeFiles.writeFile;
  const canShare = !!nativeFiles?.shareFileMessage;

  async function chooseImportFile(): Promise<MiniPersonalLibraryImportContents | null> {
    if (!nativeFiles?.chooseMessageFile || !nativeFiles.readFile) {
      throw new Error("当前环境无法选择本机文件；可以继续粘贴 CSV、JSON 或表格内容。");
    }
    const file = await nativeFiles.chooseMessageFile({ count: 1, type: "file", extension: ["csv", "json"] });
    if (!file) return null;
    if (!/\.(?:csv|json)$/iu.test(file.name)) throw new Error("请选择 CSV 或 JSON 文件。");
    const text = await nativeFiles.readFile(file.path);
    return { ...file, text };
  }

  async function saveExportFile(contents: string): Promise<SavedPersonalLibraryExportFile> {
    if (!nativeFiles?.userDataPath || !nativeFiles.writeFile) {
      throw new Error("当前环境无法写入小程序本机文件；备份 JSON 仍保留在文本框中，可以复制保存。");
    }
    if (!contents.trim()) throw new Error("请先生成个人词库备份 JSON。");
    const now = (nativeFiles.now ?? (() => new Date()))();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
      "-",
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0"),
      String(now.getMilliseconds()).padStart(3, "0"),
    ].join("");
    const name = `KotoBud-personal-library-${stamp}.json`;
    const path = `${nativeFiles.userDataPath.replace(/\/+$/u, "")}/${name}`;
    await nativeFiles.writeFile(path, contents);
    return { path, name };
  }

  async function shareExportFile(file: SavedPersonalLibraryExportFile): Promise<void> {
    if (!nativeFiles?.shareFileMessage) throw new Error("当前环境不支持分享本机文件；可以复制备份 JSON 保存。");
    await nativeFiles.shareFileMessage(file);
  }

  return { canImport, canSave, canShare, chooseImportFile, saveExportFile, shareExportFile };
}

interface MiniFileSystemManager {
  readFile(options: {
    filePath: string;
    encoding: "utf8";
    success: (result: { data: string | ArrayBuffer }) => void;
    fail: (error: unknown) => void;
  }): void;
  writeFile(options: {
    filePath: string;
    data: string;
    encoding: "utf8";
    success: () => void;
    fail: (error: unknown) => void;
  }): void;
}

interface MiniWeChatRuntime {
  env?: { USER_DATA_PATH?: string };
  chooseMessageFile?: (options: {
    count: 1;
    type: "file";
    extension: string[];
    success: (result: { tempFiles: Array<{ name: string; path: string }> }) => void;
    fail: (error: { errMsg?: string }) => void;
  }) => void;
  getFileSystemManager?: () => MiniFileSystemManager;
  shareFileMessage?: (options: {
    filePath: string;
    fileName: string;
    success: () => void;
    fail: (error: { errMsg?: string }) => void;
  }) => void;
}

function createWeChatNativeFiles(): MiniPersonalLibraryNativeFiles | undefined {
  const runtime = (globalThis as typeof globalThis & { wx?: MiniWeChatRuntime }).wx;
  if (!runtime) return undefined;
  let manager: MiniFileSystemManager | undefined;
  try { manager = runtime.getFileSystemManager?.(); } catch { manager = undefined; }
  const userDataPath = runtime.env?.USER_DATA_PATH ?? "";
  const files: MiniPersonalLibraryNativeFiles = { userDataPath };

  if (runtime.chooseMessageFile) {
    files.chooseMessageFile = (options) => new Promise((resolve, reject) => {
      runtime.chooseMessageFile!({
        ...options,
        success: (result) => {
          const file = result.tempFiles[0];
          resolve(file ? { name: file.name, path: file.path } : null);
        },
        fail: (error) => {
          if (isMiniPersonalLibraryFileCancel(error)) resolve(null);
          else reject(new Error(error.errMsg || "选择文件失败，请重试。"));
        },
      });
    });
  }

  if (manager) {
    files.readFile = (path) => new Promise((resolve, reject) => {
      manager.readFile({
        filePath: path,
        encoding: "utf8",
        success: ({ data }) => typeof data === "string" ? resolve(data) : reject(new Error("文件不是可读取的 UTF-8 文本。")),
        fail: (error) => reject(new Error(error instanceof Error ? error.message : "读取文件失败，请检查文件后重试。")),
      });
    });
    files.writeFile = (path, contents) => new Promise((resolve, reject) => {
      manager.writeFile({
        filePath: path,
        data: contents,
        encoding: "utf8",
        success: resolve,
        fail: (error) => reject(new Error(error instanceof Error ? error.message : "保存文件失败，请重试。")),
      });
    });
  }

  if (runtime.shareFileMessage) {
    files.shareFileMessage = (file) => new Promise((resolve, reject) => {
      runtime.shareFileMessage!({
        filePath: file.path,
        fileName: file.name,
        success: resolve,
        fail: (error) => reject(new Error(error.errMsg || "分享文件未完成。")),
      });
    });
  }
  return files;
}

export const miniPersonalLibraryFiles = createMiniPersonalLibraryFileService(createWeChatNativeFiles());

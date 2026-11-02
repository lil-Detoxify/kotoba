export interface AnswerSoundFileSystem {
  readFileSync(filePath: string): string | ArrayBuffer;
  writeFileSync(filePath: string, data: string | ArrayBuffer): void;
}

export interface AnswerSoundSourceRuntime {
  env?: { USER_DATA_PATH?: string };
  getFileSystemManager?: () => AnswerSoundFileSystem;
}

export interface AnswerSoundSource {
  resolve(path: string): Promise<string>;
}

export interface AnswerSoundSourceOptions {
  platform?: () => string | undefined;
  runtime?: () => AnswerSoundSourceRuntime | undefined;
  baseUrl?: string;
}

declare const wx: AnswerSoundSourceRuntime;

const ALLOWED_SOUNDS = new Set([
  "chime-correct.wav",
  "chime-incorrect.wav",
  "stone-correct.wav",
  "stone-incorrect.wav",
  "timber-correct.wav",
  "timber-incorrect.wav",
  "wood-correct.wav",
  "wood-incorrect.wav",
]);

/** Resolve packaged feedback sounds to an H5 URL or a playable native user file. */
export function createAnswerSoundSource(options: AnswerSoundSourceOptions = {}): AnswerSoundSource {
  const resolvedPaths = new Map<string, Promise<string>>();
  const baseUrl = options.baseUrl ?? "/";

  function getRuntime(): AnswerSoundSourceRuntime | undefined {
    if (options.runtime) return options.runtime();
    // Uni may expose these as injected globals that are not own properties of globalThis.
    if (typeof wx !== "undefined") return wx as unknown as AnswerSoundSourceRuntime;
    if (typeof uni !== "undefined") return uni as unknown as AnswerSoundSourceRuntime;
    return undefined;
  }

  function getPlatform(runtime: AnswerSoundSourceRuntime | undefined): string {
    if (options.platform) return options.platform() ?? "h5";
    return runtime?.env?.USER_DATA_PATH && runtime.getFileSystemManager ? "mp-weixin" : "h5";
  }

  function getFileName(path: string): string {
    const match = /^\/?static\/answer-sounds\/([^/]+)$/.exec(path);
    const fileName = match?.[1];
    if (!fileName || !ALLOWED_SOUNDS.has(fileName)) {
      throw new Error("Unknown packaged answer sound");
    }
    return fileName;
  }

  function nativePath(fileName: string, runtime: AnswerSoundSourceRuntime | undefined): Promise<string> {
    const existing = resolvedPaths.get(fileName);
    if (existing) return existing;

    const task = Promise.resolve().then(() => {
      const userDataPath = runtime?.env?.USER_DATA_PATH;
      const fileSystem = runtime?.getFileSystemManager?.();
      if (!userDataPath || !fileSystem) throw new Error("Native answer sound file system is unavailable");

      const packagePath = `static/answer-sounds/${fileName}`;
      let data: string | ArrayBuffer;
      try {
        // WeChat accepts package paths relative to the package root; some runtimes expose the same file with a leading slash.
        data = fileSystem.readFileSync(packagePath);
      } catch (relativeError) {
        try {
          data = fileSystem.readFileSync(`/${packagePath}`);
        } catch {
          throw relativeError;
        }
      }
      if (typeof data === "string") throw new Error("Packaged answer sound was not read as binary data");

      const destination = `${userDataPath.replace(/\/+$/, "")}/kotobud-answer-sound-${fileName}`;
      fileSystem.writeFileSync(destination, data);
      return destination;
    });

    resolvedPaths.set(fileName, task);
    void task.catch(() => {
      if (resolvedPaths.get(fileName) === task) resolvedPaths.delete(fileName);
    });
    return task;
  }

  return {
    async resolve(path: string): Promise<string> {
      const fileName = getFileName(path);
      const runtime = getRuntime();
      if (getPlatform(runtime) !== "mp-weixin") {
        return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}static/answer-sounds/${fileName}`;
      }
      return nativePath(fileName, runtime);
    },
  };
}

export const miniAnswerSoundSource = createAnswerSoundSource();

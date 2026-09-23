export interface CosAssetEntry {
  localPath: string;
  key: string;
  size: number;
  sha256: string;
  contentType: string;
  cacheControl: string;
}

export interface CosAssetManifest {
  scope: "books" | "audio" | "all";
  entries: CosAssetEntry[];
  objectCount: number;
  totalBytes: number;
}

export const repoRoot: string;
export function buildManifest(scope?: string): Promise<CosAssetManifest>;

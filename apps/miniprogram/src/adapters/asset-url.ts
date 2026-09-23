const TEXTBOOK_COS_ORIGIN = "https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com";
export const MINIPROGRAM_COS_ORIGIN = TEXTBOOK_COS_ORIGIN;

function normalizeHttpsOrigin(value: string | undefined, fallback: string): string {
  const configured = value?.trim();
  const candidate = configured || fallback;
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(candidate)) {
    throw new Error("小程序资源基址必须是无路径、无参数的 HTTPS 域名");
  }
  return candidate.replace(/\/+$/, "");
}

/**
 * Textbook payloads can move independently from the Cloudflare API.
 * The verified COS origin is the default; builds may override it with an
 * explicit HTTPS origin when rolling back a release.
 */
export const MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL = normalizeHttpsOrigin(
  import.meta.env.VITE_MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL,
  TEXTBOOK_COS_ORIGIN,
);

/** Verified audio objects use COS; playback falls back to Cloudflare on error. */
export const MINIPROGRAM_AUDIO_ASSET_BASE_URL = normalizeHttpsOrigin(
  import.meta.env.VITE_MINIPROGRAM_AUDIO_ASSET_BASE_URL,
  MINIPROGRAM_COS_ORIGIN,
);

export function assetUrl(path: string, baseUrl: string): string {
  if (!path.startsWith("/")) throw new Error("资源路径必须以 / 开头");
  return `${baseUrl}${path}`;
}

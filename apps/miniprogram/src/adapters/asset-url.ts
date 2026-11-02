const TEXTBOOK_COS_ORIGIN = "https://kotobud-assets-1490543304.cos.ap-beijing.myqcloud.com";
const KOTOBUD_ASSET_ORIGIN = "https://kotobud.com";
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
 * The KotoBud origin serves the deployed static textbook files by default;
 * builds may override it with another explicit HTTPS origin such as COS.
 */
export const MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL = normalizeHttpsOrigin(
  import.meta.env.VITE_MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL,
  KOTOBUD_ASSET_ORIGIN,
);

/** Audio uses the deployed KotoBud routes by default; builds may override the origin. */
export const MINIPROGRAM_AUDIO_ASSET_BASE_URL = normalizeHttpsOrigin(
  import.meta.env.VITE_MINIPROGRAM_AUDIO_ASSET_BASE_URL,
  KOTOBUD_ASSET_ORIGIN,
);

export function assetUrl(path: string, baseUrl: string): string {
  if (!path.startsWith("/")) throw new Error("资源路径必须以 / 开头");
  return `${baseUrl}${path}`;
}

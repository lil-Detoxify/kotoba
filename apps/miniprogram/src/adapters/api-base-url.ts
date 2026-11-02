const DEFAULT_API_BASE_URL = "https://kotobud.com";
const ALLOWED_API_BASE_URL = /^https:\/\/(?:kotobud\.com|staging\.kotobud\.com)\/?$/;

/** Keep mini-program auth and sync on one explicitly selected D1 environment. */
export function resolveMiniProgramApiBaseUrl(value: string | undefined): string {
  const configured = value?.trim();
  if (!configured) return DEFAULT_API_BASE_URL;
  if (!ALLOWED_API_BASE_URL.test(configured)) {
    throw new Error("小程序 API 基址必须是 kotobud.com 或 staging.kotobud.com 的 HTTPS 根地址");
  }
  return configured.replace(/\/$/, "");
}

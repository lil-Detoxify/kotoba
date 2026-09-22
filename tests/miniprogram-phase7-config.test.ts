import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mini-program phase 7 release configuration", () => {
  it("registers privacy checking, the local notice, and portrait orientation", () => {
    const manifest = JSON.parse(read("apps/miniprogram/src/manifest.json"));
    const pages = JSON.parse(read("apps/miniprogram/src/pages.json"));

    expect(manifest["mp-weixin"].__usePrivacyCheck__).toBe(true);
    expect(manifest["mp-weixin"].appid).toBe("wx63a1b41c7c7e9de2");
    expect(manifest["mp-weixin"].setting.urlCheck).toBe(true);
    expect(pages.globalStyle.pageOrientation).toBe("portrait");
    expect(pages.pages.some((page: { path?: string }) => page.path === "pages/privacy/privacy")).toBe(true);
  });

  it("uses the platform privacy authorization button with a local fallback page", () => {
    const app = read("apps/miniprogram/src/App.vue");
    const privacyPage = read("apps/miniprogram/src/pages/privacy/privacy.vue");
    const settingsPage = read("apps/miniprogram/src/pages/settings/settings.vue");
    const privacyService = read("apps/miniprogram/src/services/privacy-consent.ts");

    expect(privacyPage).toContain('open-type="agreePrivacyAuthorization"');
    expect(privacyPage).toContain('@agreeprivacyauthorization="agreePrivacy"');
    expect(privacyPage).not.toMatch(/open-type="agreePrivacyAuthorization"[^>]*@tap="agreePrivacy"/);
    expect(privacyPage).toContain("openPrivacyContract");
    expect(privacyService).toContain("getPrivacySetting");
    expect(privacyService).toContain("needAuthorization");
    expect(app).toContain("defaultSyncCoordinator.signOutToGuest()");
    expect(app).toContain("defaultAuthService.clearLocalSession()");
    expect(settingsPage).toContain('uni.navigateTo({ url: "/pages/privacy/privacy" })');
    for (const source of [privacyPage, settingsPage]) {
      const signOut = source.indexOf("defaultSyncCoordinator.signOutToGuest()", source.indexOf("withdrawPrivacy"));
      const revoke = source.indexOf("defaultPrivacyConsent.revoke()", source.indexOf("withdrawPrivacy"));
      expect(signOut).toBeGreaterThan(-1);
      expect(revoke).toBeGreaterThan(signOut);
    }
  });

  it("keeps every page above the bottom safe area", () => {
    for (const path of [
      "apps/miniprogram/src/pages/index/index.vue",
      "apps/miniprogram/src/pages/books/books.vue",
      "apps/miniprogram/src/pages/lists/lists.vue",
      "apps/miniprogram/src/pages/study/study.vue",
      "apps/miniprogram/src/pages/review/review.vue",
      "apps/miniprogram/src/pages/settings/settings.vue",
      "apps/miniprogram/src/pages/privacy/privacy.vue",
    ]) {
      expect(read(path), path).toContain("env(safe-area-inset-bottom)");
    }
  });

  it("provides separate development and release build verification", () => {
    const packageJson = JSON.parse(read("apps/miniprogram/package.json"));
    expect(packageJson.scripts["verify:build"]).toContain("verify-build.mjs");
    expect(packageJson.scripts["verify:release"]).toContain("--release");
    expect(read("apps/miniprogram/scripts/verify-build.mjs")).toContain("touristappid is not accepted");
    expect(read("apps/miniprogram/scripts/verify-build.mjs")).toContain("legal-domain checking");
  });
});

import { describe, expect, it } from "vitest";
import { resolveMiniProgramApiBaseUrl } from "../apps/miniprogram/src/adapters/api-base-url";

describe("mini-program API environment", () => {
  it("uses production only when the build does not select an API origin", () => {
    expect(resolveMiniProgramApiBaseUrl(undefined)).toBe("https://kotobud.com");
    expect(resolveMiniProgramApiBaseUrl("  ")).toBe("https://kotobud.com");
  });

  it("selects the preview D1 origin for a staging build", () => {
    expect(resolveMiniProgramApiBaseUrl("https://staging.kotobud.com"))
      .toBe("https://staging.kotobud.com");
    expect(resolveMiniProgramApiBaseUrl(" https://staging.kotobud.com/ "))
      .toBe("https://staging.kotobud.com");
  });

  it.each([
    "http://staging.kotobud.com",
    "https://staging.kotobud.com.evil.example",
    "https://user@staging.kotobud.com",
    "https://staging.kotobud.com:8443",
    "https://staging.kotobud.com/api",
    "https://staging.kotobud.com?env=production",
    "https://staging.kotobud.com/#login",
  ])("rejects an unsafe or ambiguous API origin: %s", value => {
    expect(() => resolveMiniProgramApiBaseUrl(value)).toThrow("小程序 API 基址必须");
  });
});

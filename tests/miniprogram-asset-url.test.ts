import { describe, expect, it } from "vitest";
import {
  MINIPROGRAM_AUDIO_ASSET_BASE_URL,
  MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL,
  assetUrl,
} from "../apps/miniprogram/src/adapters/asset-url";

describe("mini-program asset origins", () => {
  it("uses the KotoBud origin for textbooks and audio", () => {
    expect(MINIPROGRAM_TEXTBOOK_ASSET_BASE_URL).toBe("https://kotobud.com");
    expect(MINIPROGRAM_AUDIO_ASSET_BASE_URL).toBe("https://kotobud.com");
  });

  it("joins only root-relative asset paths", () => {
    expect(assetUrl("/data/books/a.json", "https://example.cos.ap-beijing.myqcloud.com"))
      .toBe("https://example.cos.ap-beijing.myqcloud.com/data/books/a.json");
    expect(() => assetUrl("https://evil.example/a.json", "https://example.cos.ap-beijing.myqcloud.com"))
      .toThrow("资源路径必须以 / 开头");
  });
});

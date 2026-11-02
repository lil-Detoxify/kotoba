import { describe, expect, it, vi } from "vitest";
import { MiniProgramAuthService } from "../apps/miniprogram/src/services/auth-service";
import type { AuthAdapter, AuthSession } from "../apps/miniprogram/src/adapters/types";

function harness(saved: AuthSession | null) {
  let current = saved;
  const storage: AuthAdapter = {
    getSession: vi.fn(async () => current),
    setSession: vi.fn(async (session) => { current = session; }),
    clearSession: vi.fn(async () => { current = null; }),
  };
  const client = {
    getSession: vi.fn(), refresh: vi.fn(), loginPassword: vi.fn(), verifyCode: vi.fn(), logout: vi.fn(), loginWechat: vi.fn(), linkWechat: vi.fn(),
  };
  return { storage, client, service: new MiniProgramAuthService(storage, client as any), current: () => current };
}

describe("mini-program auth service", () => {
  it("restores only a canonical server-confirmed user", async () => {
    const h = harness({ userId: "kb_1", token: "at_1", refreshToken: "rt_1" });
    h.client.getSession.mockResolvedValue({ authenticated: true, user: { id: "kb_1", email: "a@example.com", provider: "kotobud" } });
    await expect(h.service.restore()).resolves.toMatchObject({ userId: "kb_1", email: "a@example.com" });
    expect(h.client.refresh).not.toHaveBeenCalled();
  });

  it("rotates a stale access token without allowing an account switch", async () => {
    const h = harness({ userId: "kb_1", token: "expired", refreshToken: "rt_1" });
    h.client.getSession.mockResolvedValue({ authenticated: false, user: null, mode: "anonymous" });
    h.client.refresh.mockResolvedValue({ success: true, token: "at_2", refreshToken: "rt_2", user: { id: "kb_1", provider: "kotobud" } });
    await expect(h.service.restore()).resolves.toMatchObject({ token: "at_2", refreshToken: "rt_2" });

    h.client.refresh.mockResolvedValue({ success: true, token: "wrong", refreshToken: "rt_3", user: { id: "kb_2", provider: "kotobud" } });
    await expect(h.service.restore()).resolves.toBeNull();
    expect(h.current()).toBeNull();
  });

  it("preserves the durable session during an outage so local account data remains reachable", async () => {
    const saved = { userId: "kb_1", token: "at_1", refreshToken: "rt_1" };
    const h = harness(saved);
    h.client.getSession.mockRejectedValue(new Error("offline"));
    await expect(h.service.restore()).resolves.toEqual(saved);
    expect(h.client.refresh).not.toHaveBeenCalled();
    expect(h.storage.clearSession).not.toHaveBeenCalled();
  });

  it("persists password login and always clears local credentials on logout", async () => {
    const h = harness(null);
    h.client.loginPassword.mockResolvedValue({ success: true, token: "at", refreshToken: "rt", user: { id: "kb_1", email: "a@example.com", provider: "kotobud" } });
    await expect(h.service.loginWithPassword(" a@example.com ", "secret")).resolves.toMatchObject({ userId: "kb_1", token: "at" });
    h.client.logout.mockRejectedValue(new Error("offline"));
    await expect(h.service.logout()).rejects.toThrow("offline");
    expect(h.current()).toBeNull();
  });

  it('uses a fresh wx.login code and preserves the account when binding', async () => {
    const h = harness(null);
    vi.stubGlobal('uni', { login: vi.fn(async () => ({ code: 'fresh-code' })) });
    h.client.loginWechat.mockResolvedValue({ success: true, token: 'at', refreshToken: 'rt', user: { id: 'kb_wechat', provider: 'wechat' } });
    await expect(h.service.loginWithWechat()).resolves.toMatchObject({ userId: 'kb_wechat', token: 'at' });
    expect(h.client.loginWechat).toHaveBeenCalledWith('fresh-code');
    h.client.linkWechat.mockResolvedValue({ success: true, userId: 'kb_wechat' });
    await h.service.linkWechat();
    expect(h.client.linkWechat).toHaveBeenCalledWith('fresh-code', 'at');
    expect(h.current()?.userId).toBe('kb_wechat');
    vi.unstubAllGlobals();
  });
});

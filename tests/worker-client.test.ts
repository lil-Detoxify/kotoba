import { describe, expect, it } from "vitest";
import { MiniProgramWorkerClient } from "../apps/miniprogram/src/adapters/worker-client";
import type { NetworkAdapter } from "../apps/miniprogram/src/adapters/types";

class MockNetwork implements NetworkAdapter {
  calls: Array<{ endpoint: string; options: any }> = [];
  responses: unknown[] = [];
  error: Error | undefined;

  async request<T>(endpoint: string, options: any = {}): Promise<T> {
    this.calls.push({ endpoint, options });
    if (this.error) throw this.error;
    return this.responses.shift() as T;
  }
}

describe("MiniProgramWorkerClient", () => {
  it("uses the Worker auth and sync contracts, including bearer headers and refresh body", async () => {
    const network = new MockNetwork();
    network.responses = [
      { authenticated: true, user: { id: "kb_1", email: "a@example.com", provider: "kotobud" } },
      { success: true, verificationId: "v_1", expiresIn: 300 },
      { exists: true, hasPassword: true, flow: "password" },
      { success: true, token: "at_1", refreshToken: "rt_1", user: { id: "kb_1", provider: "kotobud" } },
      { success: true, token: "at_2", refreshToken: "rt_2", user: { id: "kb_1", provider: "kotobud" } },
      { success: true, message: "已安全退出登录" },
      { userId: "kb_1", hasCloudData: false, progressCount: 0, eventCount: 0 },
      { userId: "kb_1", progress: [], events: [], serverTime: "2026-09-22T00:00:00.000Z" },
      { success: true, acceptedEvents: 0, updatedProgress: 0, settingsConflict: false, serverTime: "2026-09-22T00:00:00.000Z" }
    ];
    const client = new MiniProgramWorkerClient("https://kotobud.com", network);

    await client.getSession("at_0");
    await client.sendCode("a@example.com");
    await client.checkAccount("a@example.com");
    await client.loginPassword("a@example.com", "password");
    await client.refresh("rt_1");
    await client.logout("rt_2");
    await client.bootstrap("at_1");
    await client.pull("at_1", "2026-09-21T00:00:00.000Z");
    await client.push("at_1", { events: [], progress: [] });

    expect(network.calls.map(call => call.endpoint)).toEqual([
      "/api/v1/session",
      "/api/v1/auth/send-code",
      "/api/v1/auth/check-account",
      "/api/v1/auth/login-password",
      "/api/v1/auth/refresh",
      "/api/v1/auth/logout",
      "/api/v1/sync/bootstrap",
      "/api/v1/sync/pull",
      "/api/v1/sync/push"
    ]);
    expect(network.calls[0].options.headers).toEqual({ Authorization: "Bearer at_0" });
    expect(network.calls[4].options.data).toEqual({ refreshToken: "rt_1" });
    expect(network.calls[5].options.data).toEqual({ refreshToken: "rt_2" });
    expect(network.calls[6].options.headers).toEqual({ Authorization: "Bearer at_1" });
    expect(network.calls[7].options.data).toEqual({ since: "2026-09-21T00:00:00.000Z" });
  });

  it("returns serverTime from sync status and rejects malformed response shapes", async () => {
    const network = new MockNetwork();
    const client = new MiniProgramWorkerClient("https://kotobud.com", network);
    network.responses = [{ status: "ok", d1_bound: true, serverTime: "2026-09-22T00:00:00.000Z" }];
    await expect(client.getSyncStatus()).resolves.toMatchObject({ serverTime: "2026-09-22T00:00:00.000Z" });

    network.responses = [{ status: "ok", d1_bound: true, timestamp: "old-field" }];
    await expect(client.getSyncStatus()).rejects.toThrow("Invalid sync status response");
  });

  it("does not swallow HTTP or 401 errors from NetworkAdapter", async () => {
    const network = new MockNetwork();
    network.error = new Error("HTTP 401");
    const client = new MiniProgramWorkerClient("https://kotobud.com", network);
    await expect(client.bootstrap("expired")).rejects.toThrow("HTTP 401");
  });
});

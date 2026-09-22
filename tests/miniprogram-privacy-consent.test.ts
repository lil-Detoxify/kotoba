import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniProgramAuthService } from "../apps/miniprogram/src/services/auth-service";
import { MiniProgramRepository } from "../apps/miniprogram/src/adapters/storage";
import { MiniSyncCoordinator } from "../apps/miniprogram/src/services/sync-coordinator";
import {
  PRIVACY_CONSENT_STORAGE_KEY,
  PRIVACY_POLICY_VERSION,
  PrivacyConsentService,
} from "../apps/miniprogram/src/services/privacy-consent";
import type { AuthAdapter, AuthSession, StorageAdapter } from "../apps/miniprogram/src/adapters/types";

function memory(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  const storage: StorageAdapter = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
  return { values, storage };
}

afterEach(() => vi.unstubAllGlobals());

describe("mini-program privacy consent gate", () => {
  it("stores a versioned decline and only accepts an explicit platform event", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage, () => "2026-09-22T00:00:00.000Z");
    const navigateTo = vi.fn();
    vi.stubGlobal("uni", {
      showModal: vi.fn(async () => ({ confirm: false })),
      navigateTo,
    });

    expect(await consent.promptOnLaunch()).toBe(false);
    expect(consent.state.status).toBe("declined");
    expect(JSON.parse(h.values.get(PRIVACY_CONSENT_STORAGE_KEY)!).policyVersion).toBe(PRIVACY_POLICY_VERSION);
    expect(await consent.requestConsent()).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/privacy/privacy" });
    expect(consent.hasConsent()).toBe(false);

    await consent.accept();
    expect(consent.hasConsent()).toBe(true);
  });

  it("treats another policy version as undecided and supports withdrawal", async () => {
    const h = memory({
      [PRIVACY_CONSENT_STORAGE_KEY]: JSON.stringify({ policyVersion: "old", status: "accepted", updatedAt: "2026-01-01" }),
    });
    const consent = new PrivacyConsentService(h.storage, () => "2026-09-22T00:00:00.000Z");
    expect(await consent.load()).toBe("undecided");
    await consent.accept();
    expect(await consent.isConsented()).toBe(true);
    await consent.revoke();
    expect(await consent.isConsented()).toBe(false);
    expect(consent.state.status).toBe("declined");
  });

  it("blocks every account network request before consent and allows it after consent", async () => {
    let current: AuthSession | null = null;
    const storage: AuthAdapter = {
      getSession: vi.fn(async () => current),
      setSession: vi.fn(async (session) => { current = session; }),
      clearSession: vi.fn(async () => { current = null; }),
    };
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    const client = {
      getSession: vi.fn(), refresh: vi.fn(), loginPassword: vi.fn(async () => ({ success: true as const, token: "at", user: { id: "u1", provider: "kotobud" } })),
      sendCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn(),
    };
    const auth = new MiniProgramAuthService(storage, client as any, consent);

    await expect(auth.loginWithPassword("a@example.com", "secret")).rejects.toThrow(/隐私保护/);
    expect(client.loginPassword).not.toHaveBeenCalled();
    await expect(auth.sendCode("a@example.com")).rejects.toThrow(/隐私保护/);
    expect(client.sendCode).not.toHaveBeenCalled();

    await consent.accept();
    await expect(auth.loginWithPassword("a@example.com", "secret")).resolves.toMatchObject({ userId: "u1" });
    expect(client.loginPassword).toHaveBeenCalledOnce();
  });

  it("always clears the local session on logout without making a remote call after withdrawal", async () => {
    let current: AuthSession | null = { userId: "u1", token: "at", refreshToken: "rt" };
    const storage: AuthAdapter = {
      getSession: vi.fn(async () => current),
      setSession: vi.fn(async (session) => { current = session; }),
      clearSession: vi.fn(async () => { current = null; }),
    };
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    await consent.decline();
    const client = { getSession: vi.fn(), refresh: vi.fn(), loginPassword: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn() };
    const auth = new MiniProgramAuthService(storage, client as any, consent);

    await auth.logout();

    expect(client.logout).not.toHaveBeenCalled();
    expect(storage.clearSession).toHaveBeenCalledOnce();
    expect(current).toBeNull();
  });

  it("uses the platform contract when available and lets the caller fall back when it fails", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    const openPrivacyContract = vi.fn(({ fail }: { fail: () => void }) => fail());
    vi.stubGlobal("uni", { openPrivacyContract });
    await expect(consent.openPrivacyContract()).resolves.toBe(false);
    expect(openPrivacyContract).toHaveBeenCalledOnce();
  });

  it("does not treat a normal showModal confirmation as platform privacy authorization", async () => {
    const h = memory();
    const navigateTo = vi.fn();
    vi.stubGlobal("uni", {
      showModal: vi.fn(async () => ({ confirm: true })),
      navigateTo,
    });
    const consent = new PrivacyConsentService(h.storage);

    await expect(consent.requestConsent()).resolves.toBe(false);
    expect(consent.hasConsent()).toBe(false);
    expect(h.values.has(PRIVACY_CONSENT_STORAGE_KEY)).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/privacy/privacy" });
  });

  it("uses the launch summary only to open the platform authorization page", async () => {
    const h = memory();
    const navigateTo = vi.fn();
    vi.stubGlobal("uni", {
      showModal: vi.fn(async () => ({ confirm: true })),
      navigateTo,
    });
    const consent = new PrivacyConsentService(h.storage);

    await expect(consent.promptOnLaunch()).resolves.toBe(false);
    expect(consent.state.status).toBe("undecided");
    expect(h.values.has(PRIVACY_CONSENT_STORAGE_KEY)).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/privacy/privacy" });
  });

  it("reads whether WeChat requires its platform authorization event", async () => {
    const h = memory();
    const getPrivacySetting = vi.fn(({ success }: { success: (result: { needAuthorization: boolean }) => void }) => {
      success({ needAuthorization: true });
    });
    vi.stubGlobal("uni", { getPrivacySetting });
    const consent = new PrivacyConsentService(h.storage);

    expect(consent.supportsPlatformAuthorization()).toBe(true);
    await expect(consent.needsPlatformAuthorization()).resolves.toBe(true);
    expect(getPrivacySetting).toHaveBeenCalledOnce();
  });

  it("invalidates stale local consent when WeChat requires authorization again", async () => {
    const h = memory();
    const navigateTo = vi.fn();
    vi.stubGlobal("uni", {
      getPrivacySetting: ({ success }: { success: (result: { needAuthorization: boolean }) => void }) => success({ needAuthorization: true }),
      navigateTo,
    });
    const consent = new PrivacyConsentService(h.storage);
    await consent.accept();

    await expect(consent.promptOnLaunch()).resolves.toBe(false);
    expect(consent.state.status).toBe("undecided");
    expect(h.values.has(PRIVACY_CONSENT_STORAGE_KEY)).toBe(false);
    expect(navigateTo).toHaveBeenCalledWith({ url: "/pages/privacy/privacy" });
  });

  it("keeps valid local consent when WeChat reports no authorization is needed", async () => {
    const h = memory();
    vi.stubGlobal("uni", {
      getPrivacySetting: ({ success }: { success: (result: { needAuthorization: boolean }) => void }) => success({ needAuthorization: false }),
    });
    const consent = new PrivacyConsentService(h.storage);
    await consent.accept();

    await expect(consent.promptOnLaunch()).resolves.toBe(true);
    expect(consent.hasConsent()).toBe(true);
  });

  it("rechecks consent after reading a saved session and before auth network calls", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    await consent.accept();
    let releaseSession!: () => void;
    const storage: AuthAdapter = {
      getSession: vi.fn(() => new Promise<AuthSession | null>((resolve) => {
        releaseSession = () => resolve({ userId: "u1", token: "at", refreshToken: "rt" });
      })),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    };
    const client = { getSession: vi.fn(), refresh: vi.fn(), loginPassword: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn() };
    const auth = new MiniProgramAuthService(storage, client as any, consent);

    const restoring = auth.restore();
    await vi.waitFor(() => expect(storage.getSession).toHaveBeenCalledOnce());
    await consent.revoke();
    releaseSession();

    await expect(restoring).rejects.toThrow(/隐私保护/);
    expect(client.getSession).not.toHaveBeenCalled();
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it("rechecks consent before a refresh fallback", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    await consent.accept();
    const storage: AuthAdapter = {
      getSession: vi.fn(async () => ({ userId: "u1", token: "at", refreshToken: "rt" })),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    };
    const client = {
      getSession: vi.fn(async () => {
        await consent.revoke();
        return { authenticated: false as const, user: null, mode: "anonymous" as const };
      }),
      refresh: vi.fn(), loginPassword: vi.fn(), sendCode: vi.fn(), verifyCode: vi.fn(), logout: vi.fn(),
    };
    const auth = new MiniProgramAuthService(storage, client as any, consent);

    await expect(auth.restore()).rejects.toThrow(/隐私保护/);
    expect(client.getSession).toHaveBeenCalledOnce();
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it("keeps sync offline after refusal, initializes after acceptance, and reinitializes after withdrawal", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    const repository = new MiniProgramRepository(h.storage);
    const auth = { restore: vi.fn(async () => null) };
    const client = { pull: vi.fn(), push: vi.fn() };
    const sync = new MiniSyncCoordinator(repository, auth as any, client as any);
    const initIfConsented = async () => {
      if (await consent.isConsented()) await sync.init();
    };

    await consent.decline();
    await initIfConsented();
    expect(auth.restore).not.toHaveBeenCalled();

    await consent.accept();
    await initIfConsented();
    expect(auth.restore).toHaveBeenCalledOnce();
    expect(sync.state.phase).toBe("signed_out");

    sync.signOutToGuest();
    await consent.revoke();
    await initIfConsented();
    expect(auth.restore).toHaveBeenCalledOnce();
    await consent.accept();
    await initIfConsented();
    expect(auth.restore).toHaveBeenCalledTimes(2);
  });

  it("gates coordinator restore and pull, then blocks push immediately after withdrawal", async () => {
    const h = memory();
    const consent = new PrivacyConsentService(h.storage);
    const repository = new MiniProgramRepository(h.storage);
    const auth = { restore: vi.fn(async () => ({ userId: "u1", token: "at" })) };
    const client = {
      pull: vi.fn(async () => ({ userId: "u1", progress: [], events: [], serverTime: "2026-09-22T00:00:00.000Z" })),
      push: vi.fn(async () => ({ success: true, acceptedEvents: 0, updatedProgress: 0, settingsConflict: false, serverTime: "2026-09-22T00:00:00.000Z" })),
    };
    const Coordinator = MiniSyncCoordinator as unknown as new (...args: any[]) => MiniSyncCoordinator;
    const sync = new Coordinator(repository, auth, client, consent);

    await consent.decline();
    await sync.init();
    expect(auth.restore).not.toHaveBeenCalled();
    expect(client.pull).not.toHaveBeenCalled();

    await consent.accept();
    await sync.init();
    expect(auth.restore).toHaveBeenCalledOnce();
    expect(client.pull).toHaveBeenCalledOnce();
    expect(sync.state.phase).toBe("ready");

    await consent.revoke();
    await expect(sync.flush("onHide")).resolves.toBe(false);
    expect(client.push).not.toHaveBeenCalled();
    expect(sync.state.phase).toBe("signed_out");
  });
});

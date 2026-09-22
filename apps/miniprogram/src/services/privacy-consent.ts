import { reactive } from "vue";
import type { StorageAdapter } from "../adapters/types";
import { UniStorageAdapter } from "../adapters/storage";

/** Bump this when the categories or purposes in the local notice change. */
export const PRIVACY_POLICY_VERSION = "2026-09-22.v1";
export const PRIVACY_CONSENT_STORAGE_KEY = "jp-vocab.privacy-consent";

export type PrivacyConsentStatus = "undecided" | "accepted" | "declined";

export interface PrivacyConsentRecord {
  policyVersion: string;
  status: Exclude<PrivacyConsentStatus, "undecided">;
  updatedAt: string;
}

export interface PrivacyConsentState {
  status: PrivacyConsentStatus;
  policyVersion: string;
  updatedAt?: string;
}

export interface PrivacyConsentGate {
  hasConsent(): boolean;
  isConsented(): Promise<boolean>;
}

type UniPrivacyRuntime = {
  showModal?: (options: {
    title: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
  }) => Promise<{ confirm?: boolean }>;
  openPrivacyContract?: (options: {
    success?: () => void;
    fail?: () => void;
  }) => void;
  getPrivacySetting?: (options: {
    success?: (result: { needAuthorization?: boolean }) => void;
    fail?: () => void;
  }) => unknown;
  navigateTo?: (options: { url: string }) => unknown;
};

const NOTICE_SUMMARY = "我们会在本机保存词书、学习进度、复习记录、设置和发音缓存。只有你同意后，登录与云同步才会向同步服务发送必要的账号和学习数据。拒绝不影响纯离线学习。";

function runtime(): UniPrivacyRuntime | undefined {
  return typeof uni === "undefined" ? undefined : uni as unknown as UniPrivacyRuntime;
}

function parseRecord(raw: string | null): PrivacyConsentRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.policyVersion !== PRIVACY_POLICY_VERSION ||
        (record.status !== "accepted" && record.status !== "declined") ||
        typeof record.updatedAt !== "string" || !record.updatedAt) return null;
    return {
      policyVersion: PRIVACY_POLICY_VERSION,
      status: record.status,
      updatedAt: record.updatedAt,
    };
  } catch {
    return null;
  }
}

export class PrivacyConsentService implements PrivacyConsentGate {
  readonly state = reactive<PrivacyConsentState>({
    status: "undecided",
    policyVersion: PRIVACY_POLICY_VERSION,
  });
  private loaded = false;
  private loadTask?: Promise<PrivacyConsentStatus>;

  constructor(
    private readonly storage: StorageAdapter = new UniStorageAdapter(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async load(): Promise<PrivacyConsentStatus> {
    if (this.loaded) return this.state.status;
    if (this.loadTask) return this.loadTask;
    const task = this.readStored().finally(() => {
      if (this.loadTask === task) this.loadTask = undefined;
    });
    this.loadTask = task;
    return task;
  }

  hasConsent(): boolean {
    return this.state.status === "accepted" && this.state.policyVersion === PRIVACY_POLICY_VERSION;
  }

  async isConsented(): Promise<boolean> {
    await this.load();
    return this.hasConsent();
  }

  /** Prompt only on a genuinely first launch; a declined choice stays offline until revisited. */
  async promptOnLaunch(): Promise<boolean> {
    const status = await this.load();
    if (status === "accepted") {
      if (!this.supportsPlatformAuthorization()) return true;
      const platformAuthorizationRequired = await this.needsPlatformAuthorization();
      if (platformAuthorizationRequired === false) return true;
      await this.clearLocalConsent();
      this.openLocalNotice();
      return false;
    }
    if (status === "declined") return false;
    const native = runtime();
    if (!native?.showModal) return false;
    try {
      const result = await native.showModal({
        title: "隐私保护说明",
        content: NOTICE_SUMMARY,
        confirmText: "查看并选择",
        cancelText: "暂不同意",
      });
      if (result.confirm) {
        this.openLocalNotice();
        return false;
      }
      await this.decline();
    } catch {
      return false;
    }
    return false;
  }

  /** Opens the notice; only its platform authorization event may record consent. */
  async requestConsent(): Promise<boolean> {
    if (await this.isConsented()) return true;
    this.openLocalNotice();
    return false;
  }

  supportsPlatformAuthorization(): boolean {
    return typeof runtime()?.getPrivacySetting === "function";
  }

  async needsPlatformAuthorization(): Promise<boolean | null> {
    const native = runtime();
    if (!native?.getPrivacySetting) return null;
    const getPrivacySetting = native.getPrivacySetting;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        getPrivacySetting({
          success: (result) => finish(typeof result.needAuthorization === "boolean" ? result.needAuthorization : null),
          fail: () => finish(null),
        });
      } catch {
        finish(null);
      }
    });
  }

  async accept(): Promise<void> {
    await this.write("accepted");
  }

  async decline(): Promise<void> {
    await this.write("declined");
  }

  async revoke(): Promise<void> {
    await this.decline();
  }

  /** Use the platform-managed notice when available; callers can open the local page on false. */
  async openPrivacyContract(): Promise<boolean> {
    const native = runtime();
    if (!native?.openPrivacyContract) return false;
    const openPrivacyContract = native.openPrivacyContract;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        openPrivacyContract({ success: () => finish(true), fail: () => finish(false) });
      } catch {
        finish(false);
      }
    });
  }

  private openLocalNotice(): void {
    try { runtime()?.navigateTo?.({ url: "/pages/privacy/privacy" }); }
    catch { /* The caller remains offline when navigation is unavailable. */ }
  }

  private async clearLocalConsent(): Promise<void> {
    try { await this.storage.removeItem(PRIVACY_CONSENT_STORAGE_KEY); }
    finally {
      this.state.status = "undecided";
      this.state.policyVersion = PRIVACY_POLICY_VERSION;
      this.state.updatedAt = undefined;
      this.loaded = true;
    }
  }

  private async readStored(): Promise<PrivacyConsentStatus> {
    let record: PrivacyConsentRecord | null = null;
    try { record = parseRecord(await this.storage.getItem(PRIVACY_CONSENT_STORAGE_KEY)); }
    catch { record = null; }
    this.state.status = record?.status ?? "undecided";
    this.state.policyVersion = PRIVACY_POLICY_VERSION;
    this.state.updatedAt = record?.updatedAt;
    this.loaded = true;
    return this.state.status;
  }

  private async write(status: Exclude<PrivacyConsentStatus, "undecided">): Promise<void> {
    const updatedAt = this.now();
    const record: PrivacyConsentRecord = { policyVersion: PRIVACY_POLICY_VERSION, status, updatedAt };
    await this.storage.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(record));
    this.state.status = status;
    this.state.policyVersion = PRIVACY_POLICY_VERSION;
    this.state.updatedAt = updatedAt;
    this.loaded = true;
  }
}

export const defaultPrivacyConsent = new PrivacyConsentService();

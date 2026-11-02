import type { CloudProgressDoc, ReviewEvent, UserSettings } from "@jp/models";
import { UniNetworkAdapter } from "./network";
import type { HttpRequestOptions, NetworkAdapter } from "./types";

export interface MiniProgramAuthUser {
  id: string;
  email?: string;
  provider: string;
}

export interface MiniProgramAuthResponse {
  success: true;
  token: string;
  refreshToken?: string;
  user: MiniProgramAuthUser;
}

export interface MiniProgramSessionAnonymous {
  authenticated: false;
  user: null;
  mode: "anonymous";
}

export interface MiniProgramSessionAuthenticated {
  authenticated: true;
  user: MiniProgramAuthUser;
}

export type MiniProgramSession = MiniProgramSessionAnonymous | MiniProgramSessionAuthenticated;

export interface MiniProgramCheckAccountResult {
  exists: boolean;
  hasPassword: boolean;
  flow: "password" | "register" | "legacy_upgrade";
}

export interface MiniProgramCapabilities {
  version: string;
  enabled: boolean;
  capabilities: string[];
  storage: string;
  auth: string;
}

export interface MiniProgramSyncStatus {
  status: string;
  d1_bound: boolean;
  serverTime: string;
}

export interface MiniProgramSyncBootstrap {
  userId: string;
  hasCloudData: boolean;
  progressCount: number;
  eventCount: number;
}

/** The Worker currently omits `_id` from pulled progress rows. */
export type MiniProgramProgressDoc = Omit<CloudProgressDoc, "_id"> & { _id?: string };

export interface MiniProgramSyncPull {
  userId: string;
  progress: MiniProgramProgressDoc[];
  events: ReviewEvent[];
  settings?: UserSettings;
  serverTime: string;
}

export interface MiniProgramSyncPush {
  success: true;
  acceptedEvents: number;
  updatedProgress: number;
  settingsConflict: boolean;
  serverTime: string;
}

export interface MiniProgramLogoutResponse {
  success: true;
  message: string;
}

export interface MiniProgramSyncPushPayload {
  events: ReviewEvent[];
  progress: MiniProgramProgressDoc[];
  settings?: UserSettings;
}

type ResponseParser<T> = (value: unknown) => T;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function invalid(label: string): never {
  throw new Error(`Invalid ${label} response`);
}

function requiredString(value: Record<string, unknown>, key: string, label: string): string {
  const item = value[key];
  if (typeof item !== "string" || item.length === 0) invalid(label);
  return item;
}

function optionalString(value: Record<string, unknown>, key: string, label: string): string | undefined {
  const item = value[key];
  if (item === undefined || item === null) return undefined;
  if (typeof item !== "string") invalid(label);
  return item;
}

function requiredBoolean(value: Record<string, unknown>, key: string, label: string): boolean {
  if (typeof value[key] !== "boolean") invalid(label);
  return value[key] as boolean;
}

function requiredNumber(value: Record<string, unknown>, key: string, label: string): number {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) invalid(label);
  return value[key] as number;
}

function requiredCount(value: Record<string, unknown>, key: string, label: string): number {
  const result = requiredNumber(value, key, label);
  if (!Number.isInteger(result) || result < 0) invalid(label);
  return result;
}

function parseAuthUser(value: unknown, label: string): MiniProgramAuthUser {
  if (!isRecord(value)) invalid(label);
  const user: MiniProgramAuthUser = {
    id: requiredString(value, "id", label),
    provider: requiredString(value, "provider", label)
  };
  const email = optionalString(value, "email", label);
  if (email !== undefined) user.email = email;
  return user;
}

function parseAuthResponse(value: unknown): MiniProgramAuthResponse {
  if (!isRecord(value) || value.success !== true) invalid("auth");
  return {
    success: true,
    token: requiredString(value, "token", "auth"),
    refreshToken: optionalString(value, "refreshToken", "auth"),
    user: parseAuthUser(value.user, "auth")
  };
}

function parseSession(value: unknown): MiniProgramSession {
  if (!isRecord(value) || typeof value.authenticated !== "boolean") invalid("session");
  if (value.authenticated === false) {
    if (value.user !== null || value.mode !== "anonymous") invalid("session");
    return { authenticated: false, user: null, mode: "anonymous" };
  }
  return { authenticated: true, user: parseAuthUser(value.user, "session") };
}

function parseCapabilities(value: unknown): MiniProgramCapabilities {
  if (!isRecord(value) || typeof value.version !== "string" || typeof value.enabled !== "boolean" ||
      !Array.isArray(value.capabilities) || !value.capabilities.every(item => typeof item === "string") ||
      typeof value.storage !== "string" || typeof value.auth !== "string") {
    invalid("capabilities");
  }
  return value as unknown as MiniProgramCapabilities;
}

function parseSyncStatus(value: unknown): MiniProgramSyncStatus {
  if (!isRecord(value) || typeof value.status !== "string" || typeof value.d1_bound !== "boolean" ||
      typeof value.serverTime !== "string" || value.serverTime.length === 0) invalid("sync status");
  return value as unknown as MiniProgramSyncStatus;
}

function parseCheckAccount(value: unknown): MiniProgramCheckAccountResult {
  if (!isRecord(value) || typeof value.exists !== "boolean" || typeof value.hasPassword !== "boolean" ||
      (value.flow !== "password" && value.flow !== "register" && value.flow !== "legacy_upgrade")) {
    invalid("check-account");
  }
  return value as unknown as MiniProgramCheckAccountResult;
}

function parseSendCode(value: unknown): { success: true; verificationId: string; expiresIn: number } {
  if (!isRecord(value) || value.success !== true) invalid("send-code");
  const expiresIn = requiredNumber(value, "expiresIn", "send-code");
  if (expiresIn <= 0) invalid("send-code");
  return {
    success: true,
    verificationId: requiredString(value, "verificationId", "send-code"),
    expiresIn
  };
}

function parseLogout(value: unknown): MiniProgramLogoutResponse {
  if (!isRecord(value) || value.success !== true) invalid("logout");
  return { success: true, message: requiredString(value, "message", "logout") };
}

function parseBootstrap(value: unknown): MiniProgramSyncBootstrap {
  if (!isRecord(value)) invalid("sync bootstrap");
  return {
    userId: requiredString(value, "userId", "sync bootstrap"),
    hasCloudData: requiredBoolean(value, "hasCloudData", "sync bootstrap"),
    progressCount: requiredCount(value, "progressCount", "sync bootstrap"),
    eventCount: requiredCount(value, "eventCount", "sync bootstrap")
  };
}

function isProgress(value: unknown): value is MiniProgramProgressDoc {
  if (!isRecord(value)) return false;
  const status = value.status;
  return typeof value.userId === "string" && value.userId.length > 0 &&
    typeof value.wordId === "string" && value.wordId.length > 0 &&
    (status === "new" || status === "learning" || status === "review" || status === "mastered") &&
    typeof value.reviewCount === "number" && Number.isFinite(value.reviewCount) &&
    typeof value.lapseCount === "number" && Number.isFinite(value.lapseCount) &&
    isRecord(value.card) && typeof value.isDifficult === "boolean" &&
    typeof value.isIgnored === "boolean" && typeof value.updatedAt === "string" && value.updatedAt.length > 0 &&
    typeof value.version === "number" && Number.isInteger(value.version) && value.version >= 0;
}

function isReviewEvent(value: unknown): value is ReviewEvent {
  if (!isRecord(value)) return false;
  return typeof value._id === "string" && value._id.length > 0 &&
    typeof value.userId === "string" && value.userId.length > 0 &&
    typeof value.wordId === "string" && value.wordId.length > 0 &&
    typeof value.reviewedAt === "string" && value.reviewedAt.length > 0 &&
    typeof value.rating === "number" && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 4 &&
    typeof value.responseTime === "number" && Number.isFinite(value.responseTime) &&
    (value.studyMode === "new" || value.studyMode === "review" || value.studyMode === "difficult") &&
    typeof value.clientCreatedAt === "string" && value.clientCreatedAt.length > 0 &&
    (value.deviceId === undefined || typeof value.deviceId === "string") &&
    (value.serverReceivedAt === undefined || typeof value.serverReceivedAt === "string") &&
    (value.quiz === undefined || isRecord(value.quiz));
}

function isSettings(value: unknown): value is UserSettings {
  if (!isRecord(value) || typeof value.userId !== "string" || value.userId.length === 0 ||
      typeof value.updatedAt !== "string" || value.updatedAt.length === 0) return false;
  if (value.email !== undefined && typeof value.email !== "string") return false;
  if (value.currentBookId !== undefined && typeof value.currentBookId !== "string") return false;
  if (value.currentBookIdSource !== undefined && value.currentBookIdSource !== "default" && value.currentBookIdSource !== "user") return false;
  if (value.lastStudiedPosition !== undefined) {
    const position = value.lastStudiedPosition;
    if (!isRecord(position) || typeof position.bookId !== "string" || typeof position.lessonId !== "string" ||
        typeof position.wordId !== "string" || typeof position.updatedAt !== "string") return false;
  }
  if (value.preferences !== undefined) {
    if (!isRecord(value.preferences)) return false;
    const voice = value.preferences.pronunciationVoice;
    if (voice !== undefined && voice !== "female" && voice !== "male") return false;
  }
  return true;
}

function parsePull(value: unknown): MiniProgramSyncPull {
  if (!isRecord(value) || typeof value.userId !== "string" || value.userId.length === 0 ||
      !Array.isArray(value.progress) || !value.progress.every(isProgress) ||
      !Array.isArray(value.events) || !value.events.every(isReviewEvent) ||
      (value.settings !== undefined && !isSettings(value.settings)) ||
      typeof value.serverTime !== "string" || value.serverTime.length === 0) invalid("sync pull");
  return value as unknown as MiniProgramSyncPull;
}

function parsePush(value: unknown): MiniProgramSyncPush {
  if (!isRecord(value) || value.success !== true || typeof value.settingsConflict !== "boolean" ||
      typeof value.serverTime !== "string" || value.serverTime.length === 0) invalid("sync push");
  return {
    success: true,
    acceptedEvents: requiredCount(value, "acceptedEvents", "sync push"),
    updatedProgress: requiredCount(value, "updatedProgress", "sync push"),
    settingsConflict: value.settingsConflict,
    serverTime: value.serverTime
  };
}

export class MiniProgramWorkerClient {
  private readonly network: NetworkAdapter;

  constructor(baseUrl = "https://kotobud.com", network?: NetworkAdapter) {
    this.network = network || new UniNetworkAdapter(baseUrl);
  }

  private async request<T>(endpoint: string, options: HttpRequestOptions, parser: ResponseParser<T>): Promise<T> {
    const value = await this.network.request<unknown>(endpoint, options);
    return parser(value);
  }

  private static bearer(token: string): Record<string, string> {
    if (!token) throw new Error("Access token is required");
    return { Authorization: `Bearer ${token}` };
  }

  async getCapabilities(): Promise<MiniProgramCapabilities> {
    return this.request("/api/v1/capabilities", {}, parseCapabilities);
  }

  async getSyncStatus(): Promise<MiniProgramSyncStatus> {
    return this.request("/api/v1/sync/status", {}, parseSyncStatus);
  }

  async getSession(token?: string): Promise<MiniProgramSession> {
    const headers = token === undefined ? undefined : MiniProgramWorkerClient.bearer(token);
    return this.request("/api/v1/session", headers ? { headers } : {}, parseSession);
  }

  async introspectSession(token?: string): Promise<MiniProgramSession> {
    return this.getSession(token);
  }

  async sendCode(email: string): Promise<{ success: true; verificationId: string; expiresIn: number }> {
    return this.request("/api/v1/auth/send-code", { method: "POST", data: { email } }, parseSendCode);
  }

  async verifyCode(email: string, code: string, verificationId: string): Promise<MiniProgramAuthResponse> {
    return this.request("/api/v1/auth/verify-code", {
      method: "POST",
      data: { email, code, verificationId }
    }, parseAuthResponse);
  }

  async checkAccount(email: string): Promise<MiniProgramCheckAccountResult> {
    return this.request("/api/v1/auth/check-account", { method: "POST", data: { email } }, parseCheckAccount);
  }

  async loginPassword(email: string, password: string): Promise<MiniProgramAuthResponse> {
    return this.request("/api/v1/auth/login-password", {
      method: "POST",
      data: { email, password }
    }, parseAuthResponse);
  }

  async loginWechat(code: string): Promise<MiniProgramAuthResponse> {
    return this.request('/api/v1/auth/wechat/mini-login', { method: 'POST', data: { code } }, parseAuthResponse);
  }

  async linkWechat(code: string, token: string): Promise<{ success: true; userId: string }> {
    return this.request('/api/v1/auth/wechat/mini-link', {
      method: 'POST', headers: MiniProgramWorkerClient.bearer(token), data: { code }
    }, value => {
      if (!isRecord(value) || value.success !== true) invalid('wechat link');
      return { success: true, userId: requiredString(value, 'userId', 'wechat link') };
    });
  }

  async loginWithPassword(email: string, password: string): Promise<MiniProgramAuthResponse> {
    return this.loginPassword(email, password);
  }

  async refresh(refreshToken?: string): Promise<MiniProgramAuthResponse> {
    const data = refreshToken === undefined ? {} : { refreshToken };
    return this.request("/api/v1/auth/refresh", { method: "POST", data }, parseAuthResponse);
  }

  async refreshToken(token?: string): Promise<MiniProgramAuthResponse> {
    return this.refresh(token);
  }

  async logout(refreshToken?: string): Promise<MiniProgramLogoutResponse> {
    const data = refreshToken === undefined ? {} : { refreshToken };
    return this.request("/api/v1/auth/logout", { method: "POST", data }, parseLogout);
  }

  async bootstrap(token: string): Promise<MiniProgramSyncBootstrap> {
    return this.request("/api/v1/sync/bootstrap", {
      method: "POST",
      headers: MiniProgramWorkerClient.bearer(token),
      data: {}
    }, parseBootstrap);
  }

  async pull(token: string, since?: string): Promise<MiniProgramSyncPull> {
    return this.request("/api/v1/sync/pull", {
      method: "POST",
      headers: MiniProgramWorkerClient.bearer(token),
      data: since === undefined ? { includeInputQuizzes: true } : { since, includeInputQuizzes: true }
    }, parsePull);
  }

  async push(token: string, payload: MiniProgramSyncPushPayload): Promise<MiniProgramSyncPush> {
    return this.request("/api/v1/sync/push", {
      method: "POST",
      headers: MiniProgramWorkerClient.bearer(token),
      data: payload
    }, parsePush);
  }
}

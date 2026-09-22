import type { AuthAdapter, AuthSession, StorageAdapter } from "./types";
import { UniStorageAdapter } from "./storage";

function parseSession(raw: string): AuthSession | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.userId !== "string" || !record.userId.trim() ||
      typeof record.token !== "string" || !record.token.trim()) return null;
  if (record.refreshToken !== undefined && typeof record.refreshToken !== "string") return null;
  if (record.email !== undefined && typeof record.email !== "string") return null;
  if (record.provider !== undefined && typeof record.provider !== "string") return null;
  return {
    userId: record.userId.trim(),
    token: record.token,
    ...(record.refreshToken ? { refreshToken: record.refreshToken } : {}),
    ...(record.email ? { email: record.email } : {}),
    ...(record.provider ? { provider: record.provider } : {}),
  };
}

export class UniAuthAdapter implements AuthAdapter {
  private sessionKey = "jp-vocab.auth-session";
  private storage: StorageAdapter;

  constructor(storage?: StorageAdapter) {
    this.storage = storage || new UniStorageAdapter();
  }

  async getSession(): Promise<AuthSession | null> {
    try {
      const raw = await this.storage.getItem(this.sessionKey);
      if (!raw) return null;
      return parseSession(raw);
    } catch {
      return null;
    }
  }

  async setSession(session: AuthSession): Promise<void> {
    if (!session.userId.trim() || !session.token.trim()) throw new Error("Invalid auth session");
    await this.storage.setItem(this.sessionKey, JSON.stringify(session));
  }

  async clearSession(): Promise<void> {
    await this.storage.removeItem(this.sessionKey);
  }
}

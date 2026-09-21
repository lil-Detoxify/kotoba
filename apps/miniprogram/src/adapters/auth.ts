import type { AuthAdapter, AuthSession, StorageAdapter } from "./types";
import { UniStorageAdapter } from "./storage";

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
      return JSON.parse(raw) as AuthSession;
    } catch {
      return null;
    }
  }

  async setSession(session: AuthSession): Promise<void> {
    await this.storage.setItem(this.sessionKey, JSON.stringify(session));
  }

  async clearSession(): Promise<void> {
    await this.storage.removeItem(this.sessionKey);
  }
}

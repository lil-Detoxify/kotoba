import type { AuthAdapter, AuthSession } from "../adapters/types";
import type { MiniProgramAuthResponse, MiniProgramWorkerClient } from "../adapters/worker-client";

type AuthClient = Pick<MiniProgramWorkerClient, "getSession" | "refresh" | "loginPassword" | "sendCode" | "verifyCode" | "logout">;

function sessionFromResponse(response: MiniProgramAuthResponse): AuthSession {
  return {
    userId: response.user.id,
    token: response.token,
    ...(response.refreshToken ? { refreshToken: response.refreshToken } : {}),
    ...(response.user.email ? { email: response.user.email } : {}),
    provider: response.user.provider,
  };
}

export class MiniProgramAuthService {
  constructor(private readonly storage: AuthAdapter, private readonly client: AuthClient) {}

  /** Restore only a server-confirmed canonical account session. */
  async restore(): Promise<AuthSession | null> {
    const saved = await this.storage.getSession();
    if (!saved) return null;
    let status: Awaited<ReturnType<AuthClient["getSession"]>>;
    try {
      status = await this.client.getSession(saved.token);
    } catch {
      // Keep the durable session during an outage. The coordinator will switch
      // to its local partition, attempt Pull, and keep Push physically gated.
      return saved;
    }
    if (status.authenticated) {
      if (status.user.id !== saved.userId) {
        await this.storage.clearSession();
        return null;
      }
      const restored: AuthSession = {
        ...saved,
        ...(status.user.email ? { email: status.user.email } : {}),
        provider: status.user.provider,
      };
      await this.storage.setSession(restored);
      return restored;
    }
    if (saved.refreshToken) {
      try {
        const refreshed = sessionFromResponse(await this.client.refresh(saved.refreshToken));
        if (refreshed.userId !== saved.userId) throw new Error("Refreshed account does not match saved account");
        await this.storage.setSession(refreshed);
        return refreshed;
      } catch {
        // Fall through to clearing a session which the server cannot restore.
      }
    }
    await this.storage.clearSession();
    return null;
  }

  async loginWithPassword(email: string, password: string): Promise<AuthSession> {
    const response = await this.client.loginPassword(email.trim(), password);
    const session = sessionFromResponse(response);
    await this.storage.setSession(session);
    return session;
  }

  async loginWithCode(email: string, code: string, verificationId: string): Promise<AuthSession> {
    const response = await this.client.verifyCode(email.trim(), code.trim(), verificationId);
    const session = sessionFromResponse(response);
    await this.storage.setSession(session);
    return session;
  }

  sendCode(email: string): Promise<{ success: true; verificationId: string; expiresIn: number }> {
    return this.client.sendCode(email.trim());
  }

  async logout(): Promise<void> {
    const session = await this.storage.getSession();
    try {
      if (session) await this.client.logout(session.refreshToken);
    } finally {
      await this.storage.clearSession();
    }
  }
}

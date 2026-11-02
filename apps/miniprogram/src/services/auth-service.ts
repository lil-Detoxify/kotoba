import type { AuthAdapter, AuthSession } from "../adapters/types";
import type { MiniProgramAuthResponse, MiniProgramWorkerClient } from "../adapters/worker-client";
import type { PrivacyConsentGate } from "./privacy-consent";

type AuthClient = Pick<MiniProgramWorkerClient, "getSession" | "refresh" | "loginPassword" | "sendCode" | "verifyCode" | "logout" | "loginWechat" | "linkWechat">;

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
  constructor(
    private readonly storage: AuthAdapter,
    private readonly client: AuthClient,
    private readonly privacyConsent?: PrivacyConsentGate,
  ) {}

  private async assertPrivacyConsent(): Promise<void> {
    if (this.privacyConsent && !(await this.privacyConsent.isConsented())) {
      throw new Error("请先同意隐私保护指引后再登录或同步。");
    }
  }

  /** Restore only a server-confirmed canonical account session. */
  async restore(): Promise<AuthSession | null> {
    await this.assertPrivacyConsent();
    const saved = await this.storage.getSession();
    if (!saved) return null;
    await this.assertPrivacyConsent();
    let status: Awaited<ReturnType<AuthClient["getSession"]>>;
    try {
      status = await this.client.getSession(saved.token);
    } catch {
      // Keep the durable session during an outage. The coordinator will switch
      // to its local partition, attempt Pull, and keep Push physically gated.
      await this.assertPrivacyConsent();
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
      await this.assertPrivacyConsent();
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
    await this.assertPrivacyConsent();
    const response = await this.client.loginPassword(email.trim(), password);
    const session = sessionFromResponse(response);
    await this.storage.setSession(session);
    return session;
  }

  async loginWithCode(email: string, code: string, verificationId: string): Promise<AuthSession> {
    await this.assertPrivacyConsent();
    const response = await this.client.verifyCode(email.trim(), code.trim(), verificationId);
    const session = sessionFromResponse(response);
    await this.storage.setSession(session);
    return session;
  }

  async loginWithWechat(): Promise<AuthSession> {
    await this.assertPrivacyConsent();
    const result = await uni.login({ provider: 'weixin' });
    if (!result.code) throw new Error('微信登录未返回有效验证码，请重试。');
    const session = sessionFromResponse(await this.client.loginWechat(result.code));
    await this.storage.setSession(session);
    return session;
  }

  async linkWechat(): Promise<void> {
    await this.assertPrivacyConsent();
    const saved = await this.storage.getSession();
    if (!saved) throw new Error('请先登录邮箱账号。');
    const result = await uni.login({ provider: 'weixin' });
    if (!result.code) throw new Error('微信登录未返回有效验证码，请重试。');
    const linked = await this.client.linkWechat(result.code, saved.token);
    if (linked.userId !== saved.userId) throw new Error('绑定账号与当前账号不一致。');
  }

  async sendCode(email: string): Promise<{ success: true; verificationId: string; expiresIn: number }> {
    await this.assertPrivacyConsent();
    return this.client.sendCode(email.trim());
  }

  async logout(): Promise<void> {
    const session = await this.storage.getSession();
    try {
      const canCallRemote = !this.privacyConsent || await this.privacyConsent.isConsented();
      if (session && canCallRemote) await this.client.logout(session.refreshToken);
    } finally {
      await this.storage.clearSession();
    }
  }

  /** Clear local credentials after privacy withdrawal without making a network request. */
  clearLocalSession(): Promise<void> {
    return this.storage.clearSession();
  }
}

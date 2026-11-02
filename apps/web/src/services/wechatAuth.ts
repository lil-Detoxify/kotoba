import type { AuthResponse } from '@jp/sync';

export interface WechatAttempt {
  attemptId: string;
  verifier: string;
  authorizeUrl: string;
  expiresAt: string;
}

const apiBase = typeof window !== 'undefined' && window.location.protocol === 'kotoba:'
  ? (import.meta.env.VITE_API_BASE_URL || 'https://kotobud.com') : '';

const messages: Record<string, string> = {
  wechat_not_configured: '微信网站登录尚未配置，请稍后再试。',
  auth_not_configured: '账号服务尚未配置安全密钥，请稍后再试。',
  wechat_redirect_mismatch: '微信授权回调域名与当前环境不一致。',
  wechat_already_bound: '此微信已绑定其他 KotoBud 账号。',
  wechat_login_failed: '微信验证失败，请重新扫码。',
  attempt_expired: '二维码已过期，请重新获取。',
  invalid_attempt: '登录请求无效，请重新获取二维码。',
  unauthorized: '账号登录已过期，请重新登录后绑定。',
  wechat_account_mismatch: '当前账号与发起微信绑定时的账号不一致，请重新扫码。',
};

async function readResponse(response: Response): Promise<Record<string, any>> {
  const body = await response.json() as Record<string, any>;
  if (!response.ok && response.status !== 202) throw new Error(messages[body.error] || body.message || '微信登录暂时不可用。');
  return body;
}

export async function beginWechatAttempt(purpose: 'login' | 'link', token?: string): Promise<WechatAttempt> {
  const response = await fetch(`${apiBase}/api/v1/auth/wechat/attempt`, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ purpose }),
  });
  const body = await readResponse(response);
  if (typeof body.attemptId !== 'string' || typeof body.verifier !== 'string' ||
      typeof body.authorizeUrl !== 'string' || typeof body.expiresAt !== 'string' ||
      new URL(body.authorizeUrl).origin !== 'https://open.weixin.qq.com') {
    throw new Error('微信登录响应无效，请重试。');
  }
  return body as WechatAttempt;
}

export async function redeemWechatAttempt(attempt: WechatAttempt, token?: string): Promise<{ pending: true } | { pending: false; linked: true; userId: string } | { pending: false; linked: false; session: AuthResponse }> {
  const response = await fetch(`${apiBase}/api/v1/auth/wechat/redeem`, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ attemptId: attempt.attemptId, verifier: attempt.verifier }),
  });
  const body = await readResponse(response);
  if (response.status === 202 && body.status === 'pending') return { pending: true };
  if (body.success === true && body.linked === true && typeof body.userId === 'string')
    return { pending: false, linked: true, userId: body.userId };
  if (body.success === true && body.linked !== true && typeof body.token === 'string' &&
      typeof body.user?.id === 'string' && typeof body.user?.provider === 'string')
    return { pending: false, linked: false, session: body as AuthResponse };
  throw new Error('微信登录响应无效，请重试。');
}

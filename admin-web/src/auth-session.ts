const TOKEN_KEY = 'workmate-admin-access-token';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export type AuthConfig = { mode: string; oidcEnabled: boolean; oidcLoginUrl?: string; devLoginEnabled: boolean };
export type AuthSession = { authenticated: boolean; context?: { userName?: string; roleIds?: string[] } };

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const response = await fetch(`${API_BASE}/auth/config`, { credentials: 'include' });
  if (!response.ok) throw new Error('无法读取登录配置');
  return response.json() as Promise<AuthConfig>;
}

export async function getSession(): Promise<AuthSession> {
  const response = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders(), credentials: 'include' });
  if (!response.ok) throw new Error('当前登录已失效');
  return response.json() as Promise<AuthSession>;
}

export async function startOidcLogin(config?: AuthConfig) {
  if (config?.oidcLoginUrl) {
    window.location.assign(config.oidcLoginUrl);
    return;
  }
  const response = await fetch(`${API_BASE}/auth/oidc/start`);
  const payload = await response.json() as { url?: string; message?: string };
  if (!response.ok || !payload.url) throw new Error(payload.message || '无法发起统一登录');
  window.location.assign(payload.url);
}

export async function devLogin(userId: string, userName: string) {
  const response = await fetch(`${API_BASE}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userName, roles: ['platform-admin', 'business-owner'] }),
  });
  const payload = await response.json() as { token?: string; message?: string };
  if (!response.ok || !payload.token) throw new Error(payload.message || '登录失败');
  localStorage.setItem(TOKEN_KEY, payload.token);
}

export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
  localStorage.removeItem(TOKEN_KEY);
}

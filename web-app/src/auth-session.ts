const TOKEN_KEY = 'workmate-access-token';
const USER_ID_KEY = 'workmate-web-user';
const USER_NAME_KEY = 'workmate-web-user-name';

const API_BASE = (import.meta.env.VITE_WEB_API_BASE || '/api').replace(/\/$/, '');

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function consumeAuthCallback() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('auth_token');
  if (!token) return false;
  localStorage.setItem(TOKEN_KEY, token);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
  return true;
}

export async function getAuthConfig() {
  const response = await fetch(`${API_BASE}/auth/config`, { credentials: 'include' });
  if (!response.ok) throw new Error('无法读取登录配置');
  return response.json() as Promise<{ mode: string; oidcEnabled: boolean; oidcLoginUrl?: string; devLoginEnabled: boolean }>;
}

export async function getSession() {
  const response = await fetch(`${API_BASE}/auth/me`, {
    headers: getIdentityHeaders(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('当前登录已失效');
  return response.json() as Promise<{ authenticated: boolean; context?: { userName?: string } }>;
}

export async function logoutSession() {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  clearAuthSession();
}

export async function startOidcLogin() {
  const response = await fetch(`${API_BASE}/auth/oidc/start`);
  const payload = await response.json() as { url?: string; message?: string };
  if (!response.ok || !payload.url) throw new Error(payload.message || '无法发起统一登录');
  window.location.assign(payload.url);
}

export function getUserName() {
  return localStorage.getItem(USER_NAME_KEY) || '企业员工';
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USER_NAME_KEY);
}

export function getIdentityHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {
    'x-tenant-id': 'workmate',
    'x-user-id': localStorage.getItem(USER_ID_KEY) || 'web-demo-user',
    'x-user-name': encodeURIComponent(getUserName()),
    'x-org-id': 'headquarters',
    'x-role-ids': 'employee,platform-admin',
  };
}

export async function devLogin(input: { userId: string; userName: string }) {
  const response = await fetch(`${API_BASE}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json() as { token?: string; message?: string };
  if (!response.ok || !payload.token) throw new Error(payload.message || '登录失败');
  localStorage.setItem(TOKEN_KEY, payload.token);
  localStorage.setItem(USER_ID_KEY, input.userId);
  localStorage.setItem(USER_NAME_KEY, input.userName);
}

import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { AuditPage } from './pages/AuditPage';
import { ConnectorsPage } from './pages/ConnectorsPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { OverviewPage } from './pages/OverviewPage';
import { SkillsPage } from './pages/SkillsPage';
import { AuthConfig, devLogin, getAuthConfig, getSession, logout, startOidcLogin } from './auth-session';

function AuthGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [config, setConfig] = useState<AuthConfig>({ mode: 'development', oidcEnabled: false, devLoginEnabled: true });
  const [userId, setUserId] = useState('platform-admin-001');
  const [userName, setUserName] = useState('平台管理员');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => Promise.all([
    getAuthConfig().then(setConfig),
    getSession().then((session) => {
      setAuthenticated(true);
      const roles = session.context?.roleIds ?? [];
      setAuthorized(roles.includes('platform-admin') || roles.includes('business-owner'));
    }),
  ]).catch(() => setAuthenticated(false)).finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
    const onExpired = () => { setAuthenticated(false); setError('登录已过期，请重新登录。'); };
    const onLogout = () => { setAuthenticated(false); setError('已退出当前管理后台会话。'); };
    window.addEventListener('auth-expired', onExpired);
    window.addEventListener('auth-logout', onLogout);
    return () => {
      window.removeEventListener('auth-expired', onExpired);
      window.removeEventListener('auth-logout', onLogout);
    };
  }, []);

  if (loading) return <div className="admin-auth-state">正在验证平台会话…</div>;
  if (authenticated && authorized) return <>{children}</>;
  if (authenticated && !authorized) return <main className="admin-login-page"><section className="admin-login-card"><span className="admin-login-kicker">WORKMATE AI PLATFORM</span><h1>暂无管理权限</h1><p>当前账号已登录，但没有平台治理权限。请联系平台管理员申请 `platform-admin` 或 `business-owner` 角色。</p><button className="button secondary admin-login-button" onClick={() => { void logout(); setAuthenticated(false); }}>退出当前账号</button></section></main>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await devLogin(userId.trim(), userName.trim()); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '登录失败'); }
    finally { setBusy(false); }
  };

  return <main className="admin-login-page"><section className="admin-login-card"><span className="admin-login-kicker">WORKMATE AI PLATFORM</span><h1>登录管理后台</h1><p>知识库、Skill、连接器和审计治理需要经过身份验证。</p>{config.oidcEnabled && <button className="button primary admin-login-button" onClick={() => void startOidcLogin(config)}>使用企业统一 SSO 登录</button>}{config.devLoginEnabled && <form onSubmit={(event) => void submit(event)}><label>演示用户 ID<input value={userId} onChange={(event) => setUserId(event.target.value)} /></label><label>姓名<input value={userName} onChange={(event) => setUserName(event.target.value)} /></label><button className="button secondary admin-login-button" disabled={busy}>{busy ? '登录中…' : '开发登录'}</button></form>}{error && <div className="admin-login-error">{error}</div>}<button className="admin-login-back" onClick={() => void logout()}>清除本地会话</button></section></main>;
}

export function App() {
  return (
    <AuthGate><Routes><Route element={<AdminLayout />}><Route index element={<OverviewPage />} /><Route path="knowledge" element={<KnowledgePage />} /><Route path="skills" element={<SkillsPage />} /><Route path="connectors" element={<ConnectorsPage />} /><Route path="audit" element={<AuditPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthGate>
  );
}

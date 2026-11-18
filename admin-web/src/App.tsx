import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { OverviewPage } from './pages/OverviewPage';
import { devLogin, getAuthConfig, getSession, logout, startOidcLogin, type AuthConfig, type AuthSession } from './auth-session';
import { LoadingBlock } from './components/Feedback';

const AuditPage = lazy(() => import('./pages/AuditPage').then(({ AuditPage }) => ({ default: AuditPage })));
const BrandingPage = lazy(() => import('./pages/BrandingPage'));
const ConnectorsPage = lazy(() => import('./pages/ConnectorsPage').then(({ ConnectorsPage }) => ({ default: ConnectorsPage })));
const KnowledgePage = lazy(() => import('./pages/KnowledgePage').then(({ KnowledgePage }) => ({ default: KnowledgePage })));
const SkillsPage = lazy(() => import('./pages/SkillsPage').then(({ SkillsPage }) => ({ default: SkillsPage })));

function AuthGate({ children }: { children: (session: AuthSession) => ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [config, setConfig] = useState<AuthConfig>({ mode: 'unknown', oidcEnabled: false, devLoginEnabled: false });
  const [userId, setUserId] = useState('platform-admin-001');
  const [userName, setUserName] = useState('平台管理员');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => Promise.all([
    getAuthConfig().then(setConfig),
    getSession().then(setSession),
  ]).catch(() => setSession(null)).finally(() => setLoading(false));

  useEffect(() => {
    void refresh();
    const onExpired = () => { setSession(null); setError('登录已过期，请重新登录。'); };
    const onLogout = () => { setSession(null); setError('已退出当前管理后台会话。'); };
    window.addEventListener('auth-expired', onExpired);
    window.addEventListener('auth-logout', onLogout);
    return () => {
      window.removeEventListener('auth-expired', onExpired);
      window.removeEventListener('auth-logout', onLogout);
    };
  }, []);

  if (loading) return <div className="admin-auth-state">正在验证平台会话…</div>;
  if (session?.authenticated) {
    if (session.context?.roleIds?.some((role) => role === 'platform-admin' || role === 'business-owner')) return children(session);
    return <main className="admin-login-page"><section className="admin-login-card"><h1>暂无管理权限</h1><p>请联系管理员申请平台治理权限。</p><button className="button secondary admin-login-button" onClick={() => { void logout(); setSession(null); }}>退出当前账号</button></section></main>;
  }

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
    <AuthGate>{(session) => (
      <Routes>
        <Route element={<AdminLayout accountName={session.context?.userName ?? '平台管理员'} canBrand={!!session.context?.roleIds?.includes('platform-admin')} />}>
          <Route index element={<OverviewPage />} />
          {session.context?.roleIds?.includes('platform-admin') && <Route path="branding" element={<Suspense fallback={<LoadingBlock />}><BrandingPage /></Suspense>} />}
          <Route path="knowledge" element={<Suspense fallback={<LoadingBlock />}><KnowledgePage /></Suspense>} />
          <Route path="skills" element={<Suspense fallback={<LoadingBlock />}><SkillsPage /></Suspense>} />
          <Route path="connectors" element={<Suspense fallback={<LoadingBlock />}><ConnectorsPage /></Suspense>} />
          <Route path="audit" element={<Suspense fallback={<LoadingBlock />}><AuditPage /></Suspense>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )}</AuthGate>
  );
}

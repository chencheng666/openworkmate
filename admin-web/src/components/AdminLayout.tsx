import { useEffect, useState } from 'react';
import {
  Activity,
  BookOpenText,
  Boxes,
  Building2,
  ChevronDown,
  DatabaseZap,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  ShieldCheck,
  X,
} from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { adminApi } from '../api';
import { getSession, logout } from '../auth-session';
import type { PlatformHealth } from '../types';

const navigation = [
  { to: '/', label: '治理总览', description: '平台运行与治理状态', icon: LayoutDashboard, end: true },
  { to: '/knowledge', label: '知识库', description: '企业知识资产与权限', icon: BookOpenText },
  { to: '/skills', label: 'Skill 管理', description: '提交、审核与发布', icon: Boxes },
  { to: '/connectors', label: '系统接入', description: '内部系统与能力连接', icon: DatabaseZap },
  { to: '/audit', label: '审计中心', description: '全链路操作留痕', icon: Activity },
];

const pageTitles: Record<string, string> = {
  '/': '治理总览',
  '/knowledge': '企业知识库',
  '/skills': 'Skill 管理',
  '/connectors': '系统接入',
  '/audit': '审计中心',
};

export function AdminLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [accountName, setAccountName] = useState('平台管理员');

  useEffect(() => {
    let cancelled = false;
    const load = () => adminApi.health().then((value) => {
      if (!cancelled) setHealth(value);
    }).catch(() => {
      if (!cancelled) setHealth(null);
    });
    void load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void getSession().then((session) => {
      if (session.context?.userName) setAccountName(session.context.userName);
    }).catch(() => undefined);
  }, []);

  const sidebar = (
    <aside className={`admin-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="brand-row">
        <div className="brand-mark"><Building2 size={18} /></div>
        {!collapsed && (
          <div className="brand-copy">
            <strong>OpenWorkMate</strong>
            <span>系统管理后台</span>
          </div>
        )}
        <button className="icon-button desktop-collapse" onClick={() => setCollapsed((value) => !value)} aria-label="收起导航">
          <PanelLeftClose size={17} />
        </button>
        <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭导航">
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-caption">{!collapsed && '平台治理'}</div>
      <nav className="admin-navigation">
        {navigation.map(({ to, label, description, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <Icon size={18} strokeWidth={1.9} />
            {!collapsed && (
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-boundary">
        <ShieldCheck size={17} />
        {!collapsed && (
          <div>
            <strong>管理与执行分离</strong>
            <span>桌面端只执行任务，本后台统一治理平台资产。</span>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="admin-shell">
      <div className={`mobile-sidebar-layer ${mobileOpen ? 'is-open' : ''}`} onClick={() => setMobileOpen(false)}>
        <div onClick={(event) => event.stopPropagation()}>{sidebar}</div>
      </div>
      <div className="desktop-sidebar-wrap">{sidebar}</div>
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航">
            <Menu size={19} />
          </button>
          <div className="topbar-title">
            <span>示例企业 · AI 治理平台</span>
            <strong>{pageTitles[location.pathname] || '系统管理'}</strong>
          </div>
          <div className="topbar-spacer" />
          <div className={`service-state ${health?.status === 'ok' ? 'is-online' : 'is-offline'}`}>
            <span className="status-dot" />
            {health?.status === 'ok' ? '平台服务正常' : '后端服务未连接'}
          </div>
          <button className="account-menu" onClick={() => { void logout(); window.dispatchEvent(new Event('auth-logout')); }} title="退出管理后台">
            <span className="account-avatar">管</span>
            <span className="account-copy"><strong>{accountName}</strong><small>当前登录身份</small></span>
            <ChevronDown size={15} />
          </button>
        </header>
        <main className="admin-content">
          <Outlet context={{ health }} />
        </main>
      </div>
    </div>
  );
}

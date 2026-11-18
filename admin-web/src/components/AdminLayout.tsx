import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BookOpenText, Boxes, DatabaseZap, LayoutDashboard, LogOut, Menu, X } from 'lucide-react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../auth-session';

const navigation = [
  { to: '/', label: '工作台', icon: LayoutDashboard },
  { to: '/knowledge', label: '知识库', icon: BookOpenText },
  { to: '/skills', label: 'Skill 管理', icon: Boxes },
  { to: '/connectors', label: '系统接入', icon: DatabaseZap },
  { to: '/audit', label: '审计中心', icon: Activity },
];

export function AdminLayout({ accountName }: { accountName: string }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageTitle = navigation.find((item) => item.to === (location.pathname.replace(/\/$/, '') || '/'))?.label ?? '管理后台';
  const menuToggle = useRef<HTMLButtonElement>(null);
  const menuClose = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mobileOpen) menuClose.current?.focus();
  }, [mobileOpen]);

  const closeMenu = () => {
    setMobileOpen(false);
    if (mobileOpen) menuToggle.current?.focus();
  };

  const signOut = async () => {
    await logout();
    window.dispatchEvent(new Event('auth-logout'));
  };

  return (
    <div className="admin-shell">
      {mobileOpen && <button className="admin-nav-backdrop" aria-label="关闭导航" tabIndex={-1} onClick={closeMenu} />}
      <aside className={`admin-sidebar ${mobileOpen ? 'is-open' : ''}`} id="admin-sidebar"
        onKeyDown={(event) => { if (event.key === 'Escape') closeMenu(); }}>
        <div className="brand-row">
          <img className="brand-logo" src={`${import.meta.env.BASE_URL}brand/logo.svg`} alt="" />
          <strong>OpenWorkMate</strong>
          <button ref={menuClose} className="icon-button mobile-close" onClick={closeMenu} aria-label="收起导航"><X size={18} /></button>
        </div>
        <nav className="admin-navigation" aria-label="管理导航">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={closeMenu}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <a className="admin-nav-item employee-link" href="/"><ArrowUpRight size={18} />员工对话</a>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button ref={menuToggle} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"
            aria-expanded={mobileOpen} aria-controls="admin-sidebar"><Menu size={19} /></button>
          <strong className="topbar-title">{pageTitle}</strong>
          <span className="account-name">{accountName}</span>
          <button className="button secondary" onClick={() => void signOut()}><LogOut size={15} />退出</button>
        </header>
        <main className="admin-content"><Outlet /></main>
      </div>
    </div>
  );
}

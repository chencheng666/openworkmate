import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowUpRight, BookOpenText, Boxes, DatabaseZap, LayoutDashboard, LogOut, Menu, Palette, Plus, X } from 'lucide-react';
import { defaultBrand, useBrandAppearance, type Brand } from '../../../ui/branding';
import { adminApi } from '../api';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { logout } from '../auth-session';

const navigation = [
  { group:'概览', to: '/', label: '工作台', icon: LayoutDashboard },
  { group:'知识与能力', to: '/knowledge', label: '知识库', icon: BookOpenText, quick:{ label:'直接上传知识', to:'/knowledge?upload=1' } },
  { group:'知识与能力', to: '/skills', label: 'Skill 管理', icon: Boxes },
  { group:'知识与能力', to: '/connectors', label: '系统接入', icon: DatabaseZap, quick:{ label:'直接新建连接器', to:'/connectors?create=1' } },
  { group:'管理设置', to: '/branding', label: '企业外观', icon: Palette },
  { group:'管理设置', to: '/audit', label: '审计中心', icon: Activity },
];

export type BrandEditor = { brand: Brand; setBrand: (value: Brand) => void; loaded: boolean; loadError: boolean; retry: () => void };

export function AdminLayout({ accountName, canBrand }: { accountName: string; canBrand: boolean }) {
  const [brand, setBrand] = useState(defaultBrand);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useBrandAppearance(brand, import.meta.env.BASE_URL, true);
  useEffect(() => {
    let active = true;
    setLoadError(false);
    adminApi.branding.read().then(value => { if (active) { setBrand(value); setLoaded(true); } })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [attempt]);
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
          <img className="brand-logo" src={brand.logo || `${import.meta.env.BASE_URL}brand/logo.svg`} alt="" />
          <strong title={brand.name}>{brand.name}</strong>
          <button ref={menuClose} className="icon-button mobile-close" onClick={closeMenu} aria-label="收起导航"><X size={18} /></button>
        </div>
        <nav className="admin-navigation" aria-label="管理导航">
          {['概览','知识与能力','管理设置'].map(group=><div className="admin-nav-group" key={group}>
            <span className="nav-caption">{group}</span>
            {navigation.filter(item => item.group === group && (canBrand || item.to !== '/branding')).map(({ to, label, icon: Icon, quick }) => (
            <div className="admin-nav-row" key={to}><NavLink to={to} end={to === '/'} onClick={closeMenu}
              className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>{quick && <Link className="nav-quick" to={quick.to} onClick={closeMenu} title={quick.label} aria-label={quick.label}><Plus size={16}/></Link>}</div>
          ))}</div>)}
        </nav>
        <a className="admin-nav-item employee-link" href="/"><ArrowUpRight size={18} />员工对话</a>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <button ref={menuToggle} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开导航"
            aria-expanded={mobileOpen} aria-controls="admin-sidebar"><Menu size={19} /></button>
          <strong>管理后台</strong><span className="topbar-title">{pageTitle}</span>
          <span className="account-name">{accountName}</span>
          <button className="button secondary" onClick={() => void signOut()}><LogOut size={15} />退出</button>
        </header>
        <main className="admin-content"><Outlet context={{ brand, setBrand, loaded, loadError, retry: () => setAttempt(n => n + 1) } satisfies BrandEditor} /></main>
      </div>
    </div>
  );
}

'use client';

import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import { useAuth } from '../auth/auth-context';
import { useSidebar } from '../contexts/sidebar-context';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import ConfirmationModal from './confirmation-modal';

// ─── Logo ──────────────────────────────────────────────────────────────────────
function AppLogo({ size = 42 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-full overflow-hidden flex items-center justify-center border border-slate-200 shadow-sm"
      style={{ width: size, height: size }}
    >
      <Image
        src={logoSrc}
        alt="Passi City Primary Health Care Facility"
        width={size}
        height={size}
        className="object-cover w-full h-full"
        priority
        unoptimized
      />
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AdminSidebarItem {
  id: string;
  label: string;
  badge?: number;
  path?: string;
  hasDropdown?: boolean;
  subItems?: { id: string; label: string; path: string; badge?: number }[];
}

// ─── Menu config ───────────────────────────────────────────────────────────────
const ADMIN_MENU: AdminSidebarItem[] = [
  { id: 'admin',                label: 'Dashboard',            path: '/admin-dashboard' },
  { id: 'inventory-records',    label: 'Pharmacy Overview',    path: '/admin-dashboard/reports/inventory' },
  {
    id: 'staff-management',
    label: 'Staff Management',
    hasDropdown: true,
    subItems: [
      { id: 'staff-list',    label: 'View All Staff',         path: '/admin-dashboard/staff-list' },
      { id: 'create-staff',  label: 'Create Staff Accounts',  path: '/admin-dashboard/create-staff-accounts' },
      { id: 'activity-logs', label: 'Staff Activity Logs',    path: '/admin-dashboard/logs' },
    ],
  },
  { id: 'system-notifications', label: 'System Notifications', path: '/admin-dashboard/system-notifications' },
];

// ─── Icons ─────────────────────────────────────────────────────────────────────
function NavIcon({ id }: { id: string }) {
  const p = {
    className: 'w-5 h-5 shrink-0',
    strokeWidth: '1.5',
    stroke: 'currentColor',
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
  };
  switch (id) {
    case 'admin':
      return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
    case 'inventory-records':
      return <svg {...p}><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m0-18h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9m0-18v18" /><path d="M9 9h6M9 15h6" /></svg>;
    case 'staff-management':
    case 'staff-list':
      return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>;
    case 'create-staff':
      return <svg {...p}><path d="M9 12l2 2 4-4m-9 8a9 9 0 1 1 18 0 9 9 0 0 1-18 0z" /></svg>;
    case 'activity-logs':
      return <svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case 'system-notifications':
      return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    default:
      return null;
  }
}

// ─── Animated Hamburger Icon ───────────────────────────────────────────────────
function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="relative w-5 h-5 flex flex-col justify-center items-center gap-[5px]">
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out origin-center ${isOpen ? 'w-5 rotate-45 translate-y-[7px]' : 'w-5'}`} />
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out ${isOpen ? 'w-0 opacity-0' : 'w-4'}`} />
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out origin-center ${isOpen ? 'w-5 -rotate-45 -translate-y-[7px]' : 'w-5'}`} />
    </div>
  );
}

// ─── Shared nav content ────────────────────────────────────────────────────────
function NavContent({
  pathname,
  currentFilter,
  openDropdown,
  setOpenDropdown,
  isCollapsed,
  router,
  onLinkClick,
}: {
  pathname: string;
  currentFilter: string | null;
  openDropdown: string | null;
  setOpenDropdown: (v: string | null) => void;
  isCollapsed: boolean;
  router: ReturnType<typeof useRouter>;
  onLinkClick?: () => void;
}) {
  const isActive = (path?: string) => {
    if (!path) return false;
    const [pathOnly] = path.split('?');
    if (pathOnly === '/admin-dashboard') return pathname === '/admin-dashboard';
    return pathname === pathOnly;
  };

  const isSubActive = (path: string) => {
    const [pathOnly, query] = path.split('?');
    if (pathname !== pathOnly) return false;
    if (!query) return !currentFilter;
    const params = new URLSearchParams(query);
    return currentFilter === params.get('filter');
  };

  const linkBase = `group relative flex items-center gap-3 rounded-xl transition-all duration-200 border`;
  const linkPad  = isCollapsed ? 'px-2 py-2 justify-center' : 'px-4 py-3';
  const activeStyle   = 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm';
  const inactiveStyle = 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent';

  return (
    <nav className="flex-1 overflow-y-auto p-3 space-y-1">
      {ADMIN_MENU.map((item) => {
        if (item.hasDropdown) {
          const isOpen         = openDropdown === item.id;
          const isAnySubActive = item.subItems?.some((s) => isActive(s.path));

          return (
            <div key={item.id} className="space-y-1">
              <button
                onClick={() => {
                  if (isCollapsed) {
                    router.push(item.subItems?.[0]?.path || '#');
                    onLinkClick?.();
                  } else {
                    setOpenDropdown(isOpen ? null : item.id);
                  }
                }}
                title={isCollapsed ? item.label : undefined}
                className={`w-full ${linkBase} ${linkPad} ${isAnySubActive && !isOpen ? activeStyle : inactiveStyle}`}
              >
                <span className={`transition-transform duration-200 ${isAnySubActive && !isOpen ? 'text-blue-600 scale-110' : 'text-slate-500 group-hover:text-slate-700 group-hover:scale-110'}`}>
                  <NavIcon id={item.id} />
                </span>
                {!isCollapsed && (
                  <>
                    <span className={`flex-1 text-left text-sm font-bold truncate ${isAnySubActive && !isOpen ? 'text-blue-700' : 'text-slate-600'}`}>
                      {item.label}
                    </span>
                    <svg className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </>
                )}
              </button>

              {isOpen && !isCollapsed && (
                <div className="ml-4 pl-4 border-l border-slate-100 space-y-1">
                  {item.subItems?.map((sub) => (
                    <Link
                      key={sub.id}
                      href={sub.path}
                      onClick={onLinkClick}
                      className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                        isSubActive(sub.path)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      <span className="truncate">{sub.label}</span>
                      {sub.badge !== undefined && sub.badge > 0 && (
                        <span className="ml-2 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black bg-red-500 text-white">
                          {sub.badge}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }

        const active = isActive(item.path);
        return (
          <Link
            key={item.id}
            href={item.path || '#'}
            onClick={onLinkClick}
            title={isCollapsed ? item.label : undefined}
            className={`${linkBase} ${linkPad} ${active ? activeStyle : inactiveStyle}`}
          >
            <span className={`transition-transform duration-200 ${active ? 'text-blue-600 scale-110' : 'text-slate-500 group-hover:text-slate-700 group-hover:scale-110'}`}>
              <NavIcon id={item.id} />
            </span>
            {!isCollapsed && (
              <span className={`flex-1 text-sm font-bold truncate ${active ? 'text-blue-700' : 'text-slate-600'}`}>
                {item.label}
              </span>
            )}
            {item.badge !== undefined && item.badge > 0 && (
              <span className={`flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black bg-red-500 text-white ${isCollapsed ? 'absolute top-1.5 right-1.5 border-2 border-white shadow-sm' : ''}`}>
                {item.badge}
              </span>
            )}
            {active && !isCollapsed && (
              <span className="absolute right-2 w-1 h-4 bg-blue-600 rounded-full opacity-40" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminSidebar() {
  const { user, logOut, adminName } = useAuth();
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [openDropdown,      setOpenDropdown]      = useState<string | null>(null);
  const [mobileOpen,        setMobileOpen]         = useState(false);

  // ── Close drawer when a nav link is tapped — no effect needed at all ──────
  const closeMobileDrawer = useCallback(() => setMobileOpen(false), []);

  // ── Lock body scroll while drawer is open (pure DOM side-effect, no setState) ──
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const currentFilter = searchParams.get('filter');

  const handleLogout = async () => {
    try { await logOut(); router.push('/'); }
    catch (err) { console.error('Logout failed:', err); }
  };

  // ── Shared header branding ─────────────────────────────────────────────────
  const brandBlock = (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <AppLogo size={36} />
      <div className="min-w-0">
        <p className="text-sm font-black uppercase tracking-wider text-slate-900 truncate leading-tight">Admin Panel</p>
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Management</p>
      </div>
    </div>
  );

  // ── Shared footer ──────────────────────────────────────────────────────────
  const footerBlock = (showEmail = true) => (
    <div className="shrink-0 border-t border-slate-200/70 p-3 space-y-2 bg-white/90 backdrop-blur-md">
      {showEmail && (
        <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Admin Session</p>
          <p className="text-xs font-bold text-slate-900 truncate">{adminName || user?.email}</p>
        </div>
      )}
      <button
        onClick={() => setShowLogoutConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-950 active:scale-95 transition-all text-xs font-bold"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
        </svg>
        <span>Sign Out</span>
      </button>
    </div>
  );

  return (
    <>
      {/* ── MOBILE: hamburger — fixed top-RIGHT ───────────────────────────────── */}
      <button
        onClick={() => setMobileOpen((prev) => !prev)}
        className={`
          lg:hidden fixed top-4 right-4 z-[70]
          flex items-center justify-center
          w-10 h-10 rounded-2xl
          shadow-lg border
          backdrop-blur-md
          transition-all duration-300 ease-in-out
          active:scale-90
          ${mobileOpen
            ? 'bg-slate-900 text-white border-slate-900 shadow-slate-900/30'
            : 'bg-white/90 text-slate-700 border-slate-200/80 hover:bg-white hover:shadow-xl hover:shadow-slate-900/10'
          }
        `}
        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileOpen}
      >
        <HamburgerIcon isOpen={mobileOpen} />
      </button>

      {/* ── MOBILE: dimmed backdrop ────────────────────────────────────────── */}
      <div
        onClick={closeMobileDrawer}
        aria-hidden="true"
        className={`
          lg:hidden fixed inset-0 z-50
          bg-slate-950/40 backdrop-blur-[2px]
          transition-all duration-300 ease-in-out
          ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
      />

      {/* ── MOBILE: slide-in drawer from the LEFT ─────────────────────────── */}
      <div
        aria-hidden={!mobileOpen}
        className={`
          lg:hidden fixed inset-y-0 left-0 z-[60]
          w-72 max-w-[85vw]
          bg-white border-r border-slate-200 shadow-2xl shadow-slate-900/20
          flex flex-col
          transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Drawer header */}
        <div className="flex items-center h-16 px-4 border-b border-slate-200 shrink-0">
          {brandBlock}
        </div>

        {/* Nav — closeMobileDrawer passed as onLinkClick so tapping any link closes the drawer */}
        <NavContent
          pathname={pathname}
          currentFilter={currentFilter}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          isCollapsed={false}
          router={router}
          onLinkClick={closeMobileDrawer}
        />

        {footerBlock(true)}
      </div>

      {/* ── DESKTOP: collapsible sidebar ────────────────────────────────────── */}
      <div className={`
        hidden lg:flex flex-col
        sticky top-0 h-screen z-30 shrink-0
        bg-white border-r border-slate-200
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-[72px]' : 'w-72'}
      `}>
        {/* Desktop header */}
        <div className={`border-b border-slate-200/70 flex items-center h-16 shrink-0 ${isCollapsed ? 'justify-center px-2' : 'px-4'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1">
              <AppLogo size={36} />
              <button onClick={toggleSidebar} className="p-1 hover:bg-slate-100 rounded-lg transition-colors" title="Expand">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center w-full gap-2">
              {brandBlock}
              <button onClick={toggleSidebar} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0" title="Collapse">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Desktop nav */}
        <NavContent
          pathname={pathname}
          currentFilter={currentFilter}
          openDropdown={openDropdown}
          setOpenDropdown={setOpenDropdown}
          isCollapsed={isCollapsed}
          router={router}
        />

        {/* Desktop footer */}
        <div className={`shrink-0 border-t border-slate-200/70 bg-white/90 backdrop-blur-md space-y-2 transition-all duration-300 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {!isCollapsed && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Admin Session</p>
              <p className="text-xs font-bold text-slate-900 truncate">{adminName || user?.email}</p>
            </div>
          )}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            title={isCollapsed ? 'Sign Out' : undefined}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-950 active:scale-95 transition-all text-xs font-bold"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      {/* ── Confirmation modal ───────────────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title="Sign Out Admin?"
        message="Are you sure you want to end your administrative session?"
        confirmText="Sign Out"
        isDangerous
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}
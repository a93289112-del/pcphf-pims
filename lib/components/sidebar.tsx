'use client';

import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import { useAuth } from '../auth/auth-context';
import { useSidebar } from '../contexts/sidebar-context';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback } from 'react';
import ConfirmationModal from './confirmation-modal';
import EndSessionModal from './end-session-modal';
import Processing from './processing';
import { database, getUserPath } from '../services/firebase';
import { ref, onValue } from 'firebase/database';
import { logActivity, subscribeToActivityLogs } from '../services/activity-logs';
import { type FirebaseTransaction } from '@/lib/types';

// ─── Storage key for session start time ────────────────────────────────────────
const SESSION_START_KEY = (uid: string) => `session_start_${uid}`;

interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  quantity?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  minStock?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>;
}

interface StatusCounts {
  urgent: number;
  expired: number;
  expiring: number;
  out: number;
  low: number;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type FieldStatus = 'out' | 'expired' | 'urgent' | 'expiring' | 'low' | 'in';

function getEffectiveStock(m: Medicine): number {
  return m.quantity ?? 0;
}

function getMedicineStatus(m: Medicine): FieldStatus {
  const stock    = getEffectiveStock(m);
  const minStock = m.minStock ?? 0;
  const exp      = m.expirationDate ? parseLocalDate(m.expirationDate) : null;
  const today    = getTodayMidnight();

  if (stock === 0) return 'out';
  if (exp && exp < today) return 'expired';

  const isLowStock     = minStock > 0 && stock <= minStock;
  let   isExpiringSoon = false;
  if (exp) {
    const days = Math.floor((exp.getTime() - today.getTime()) / 86_400_000);
    if (days <= 30) isExpiringSoon = true;
  }

  if (isLowStock && isExpiringSoon) return 'urgent';
  if (isExpiringSoon) return 'expiring';
  if (isLowStock) return 'low';
  return 'in';
}

function computeStatusCounts(medicines: Medicine[]): StatusCounts {
  let urgent = 0, expired = 0, expiring = 0, out = 0, low = 0;
  for (const m of medicines) {
    const s = getMedicineStatus(m);
    if      (s === 'out')      out++;
    else if (s === 'expired')  expired++;
    else if (s === 'urgent')   urgent++;
    else if (s === 'expiring') expiring++;
    else if (s === 'low')      low++;
  }
  return { urgent, expired, expiring, out, low };
}

const STATUS_ROWS: {
  key: keyof StatusCounts;
  label: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
}[] = [
  { key: 'urgent',   label: 'Urgent',       dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  { key: 'expired',  label: 'Expired',      dot: 'bg-red-400',    text: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100' },
  { key: 'expiring', label: 'Expiring',     dot: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  { key: 'out',      label: 'Out of Stock', dot: 'bg-slate-500',  text: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200' },
  { key: 'low',      label: 'Low Stock',    dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
];

// ─── Menu config ───────────────────────────────────────────────────────────────
interface StaffMenuItem {
  id: string;
  label: string;
  path?: string;
  hasDropdown?: boolean;
  subItems?: { id: string; label: string; path: string }[];
}

const STAFF_MENU: StaffMenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/staff-dashboard' },
  {
    id: 'inventory',
    label: 'Inventory',
    hasDropdown: true,
    subItems: [
      { id: 'medicine-inventory', label: 'Medicine Inventory', path: '/inventory' },
      { id: 'inventory-records',  label: 'Inventory Records',  path: '/inventory-records' },
    ],
  },
  {
    id: 'medicines',
    label: 'Medicines',
    hasDropdown: true,
    subItems: [
      { id: 'medicines-list',  label: 'View All',          path: '/medicines' },
      { id: 'add-medicine',    label: 'Add Medicines',     path: '/medicines/add-medicine' },
      { id: 'stock-adj',       label: 'Stock Adjustments', path: '/stock-adjustments' },
    ],
  },
  {
    id: 'dispense',
    label: 'Dispense',
    hasDropdown: true,
    subItems: [
      { id: 'dispense-medicine',   label: 'Dispense Medicine',  path: '/dispense' },
      { id: 'dispensing-records',  label: 'Dispensing Records', path: '/dispensing-records' },
    ],
  },
  {
    id: 'pos',
    label: 'Point of Sale',
    hasDropdown: true,
    subItems: [
      { id: 'pos-sales',   label: 'Sales',         path: '/pos' },
      { id: 'pos-history', label: 'Sales History',  path: '/pos-history' },
    ],
  },
  { id: 'notifications', label: 'Notifications', path: '/notifications' },
  { id: 'reports',       label: 'Reports',        path: '/reports' },
];

// ─── Sub-components ────────────────────────────────────────────────────────────
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

function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="relative w-5 h-5 flex flex-col justify-center items-center gap-[5px]">
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out origin-center ${isOpen ? 'w-5 rotate-45 translate-y-[7px]' : 'w-5'}`} />
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out ${isOpen ? 'w-0 opacity-0' : 'w-4'}`} />
      <span className={`block h-[2px] bg-current rounded-full transition-all duration-300 ease-in-out origin-center ${isOpen ? 'w-5 -rotate-45 -translate-y-[7px]' : 'w-5'}`} />
    </div>
  );
}

function NotifBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count === 0) return null;
  const label = count > 99 ? '99+' : String(count);
  if (collapsed) {
    return (
      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold shadow-md border-2 border-white z-10">
        {label}
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm shrink-0">
      {label}
    </span>
  );
}

function StatusBreakdown({ counts, open }: { counts: StatusCounts; open: boolean }) {
  const activeRows = STATUS_ROWS.filter((r) => counts[r.key] > 0);
  if (activeRows.length === 0 || !open) return null;
  return (
    <div className="mt-1 ml-4 px-2 pb-2 space-y-1">
      {activeRows.map((row) => (
        <Link
          key={row.key}
          href={`/notifications?tab=${row.key}`}
          className={`flex items-center justify-between px-3 py-1.5 rounded-lg border ${row.bg} ${row.border} hover:brightness-95 transition-all`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${row.dot} ${row.key === 'urgent' ? 'animate-pulse' : ''}`} />
            <span className={`text-xs font-semibold truncate ${row.text}`}>{row.label}</span>
          </div>
          <span className={`text-xs font-bold shrink-0 ml-2 min-w-[20px] text-center px-1.5 py-0.5 rounded-md ${row.bg} ${row.text} border ${row.border}`}>
            {counts[row.key]}
          </span>
        </Link>
      ))}
    </div>
  );
}

// ─── Nav icons ─────────────────────────────────────────────────────────────────
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
    case 'dashboard':
      return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
    case 'inventory':
      return <svg {...p}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>;
    case 'medicines':
      return <svg {...p}><rect x="4.5" y="9" width="15" height="6" rx="3" /><line x1="12" y1="9" x2="12" y2="15" /></svg>;
    case 'dispense':
      return <svg {...p}><path d="M7 17.5c0 2.485 2.015 4.5 4.5 4.5s4.5-2.015 4.5-4.5C16 14 11.5 8 11.5 8S7 14 7 17.5z" /><line x1="11.5" y1="2" x2="11.5" y2="6" /><line x1="8.5" y1="4" x2="14.5" y2="4" /></svg>;
    case 'pos':
      return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5" /><line x1="3" y1="11" x2="21" y2="11" /><circle cx="18" cy="16" r="1" fill="currentColor" /></svg>;
    case 'notifications':
      return <svg {...p}><path d="M6 10a6 6 0 1112 0v4l1.5 2h-15L6 14v-4z" /><path d="M10 19a2 2 0 004 0" /></svg>;
    case 'reports':
      return <svg {...p}><line x1="3" y1="21" x2="21" y2="21" /><rect x="5" y="13" width="4" height="8" rx="0.5" /><rect x="10" y="9" width="4" height="12" rx="0.5" /><rect x="15" y="5" width="4" height="16" rx="0.5" /></svg>;
    default:
      return null;
  }
}

// ─── Shared NavContent ─────────────────────────────────────────────────────────
function NavContent({
  pathname,
  openDropdown,
  setOpenDropdown,
  isCollapsed,
  router,
  onLinkClick,
  role,
  statusCounts,
  totalAlerts,
  notifPanelOpen,
  setNotifPanelOpen,
}: {
  pathname: string;
  openDropdown: string | null;
  setOpenDropdown: (v: string | null) => void;
  isCollapsed: boolean;
  router: ReturnType<typeof useRouter>;
  onLinkClick?: () => void;
  role: string | null | undefined;
  statusCounts: StatusCounts;
  totalAlerts: number;
  notifPanelOpen: boolean;
  setNotifPanelOpen: (v: boolean | ((p: boolean) => boolean)) => void;
}) {
  const isActive = (id: string): boolean => {
    switch (id) {
      case 'dashboard':     return pathname === '/staff-dashboard';
      case 'inventory':     return pathname === '/inventory' || pathname.startsWith('/inventory/') || pathname === '/inventory-records' || pathname.startsWith('/inventory-records/');
      case 'medicines':     return pathname === '/medicines' || pathname.startsWith('/medicines/') || pathname === '/stock-adjustments' || pathname.startsWith('/stock-adjustments/');
      case 'dispense':      return pathname === '/dispense' || pathname.startsWith('/dispense/') || pathname === '/dispensing-records' || pathname.startsWith('/dispensing-records/');
      case 'pos':           return pathname === '/pos' || (pathname.startsWith('/pos/') && !pathname.startsWith('/pos-history')) || pathname === '/pos-history' || pathname.startsWith('/pos-history/');
      case 'notifications': return pathname === '/notifications' || pathname.startsWith('/notifications/');
      case 'reports':       return pathname === '/reports' || pathname.startsWith('/reports/');
      default:              return pathname === `/${id}` || pathname.startsWith(`/${id}/`);
    }
  };

  const isSubActive = (path: string) => {
    if (path === '/inventory') return pathname === '/inventory' || (pathname.startsWith('/inventory/') && !pathname.startsWith('/inventory-records'));
    if (path === '/medicines') return pathname === '/medicines' || (pathname.startsWith('/medicines/') && !pathname.startsWith('/medicines/add-medicine'));
    if (path === '/pos')       return pathname === '/pos' || (pathname.startsWith('/pos/') && !pathname.startsWith('/pos-history'));
    return pathname === path || pathname.startsWith(path + '/');
  };

  const linkBase      = 'group relative flex items-center gap-3 rounded-xl transition-all duration-200 border';
  const linkPad       = isCollapsed ? 'px-2 py-2 justify-center' : 'px-4 py-3';
  const activeStyle   = 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm';
  const inactiveStyle = 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent';

  const effectiveNotifOpen = !isCollapsed && notifPanelOpen;
  const hasAlerts = STATUS_ROWS.some((r) => statusCounts[r.key] > 0);

  return (
    <nav className="flex-1 overflow-y-auto p-3 space-y-1">
      {/* Admin panel shortcut */}
      {role === 'admin' && (
        <Link
          href="/admin-dashboard"
          onClick={onLinkClick}
          className={`flex items-center gap-3 rounded-xl transition-all border text-violet-600 bg-violet-50 border-violet-100 shadow-sm hover:bg-violet-100 mb-3 ${isCollapsed ? 'px-2 py-2 justify-center' : 'px-4 py-2.5'}`}
          title={isCollapsed ? 'Admin Panel' : undefined}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" /><path d="M7 17a5 5 0 0 1 10 0" />
          </svg>
          {!isCollapsed && <span className="text-xs font-black uppercase tracking-wider">Admin Panel</span>}
        </Link>
      )}

      {STAFF_MENU.map((item) => {
        // ── Notifications (special: badge + breakdown panel) ───────────────
        if (item.id === 'notifications') return (
          <div key={item.id} className="space-y-1">
            {isCollapsed ? (
              <Link
                href="/notifications"
                title={`Notifications${totalAlerts > 0 ? ` — ${totalAlerts} alerts` : ''}`}
                className={`relative w-full ${linkBase} ${linkPad} ${isActive(item.id) ? activeStyle : inactiveStyle}`}
              >
                {<NavIcon id={item.id} />}
                <NotifBadge count={totalAlerts} collapsed={true} />
              </Link>
            ) : (
              <>
                <div className={`flex items-center gap-1 rounded-xl border transition-all ${isActive(item.id) ? 'bg-blue-50 border-blue-100 shadow-sm' : 'border-transparent hover:bg-slate-100/80'}`}>
                  <Link
                    href="/notifications"
                    onClick={onLinkClick}
                    className={`flex items-center gap-3 flex-1 min-w-0 px-4 py-3 rounded-xl transition-colors ${isActive(item.id) ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <span className="relative shrink-0"><NavIcon id={item.id} /></span>
                    <span className="text-sm font-bold truncate">{item.label}</span>
                    <NotifBadge count={totalAlerts} collapsed={false} />
                  </Link>
                  {hasAlerts && (
                    <button
                      onClick={() => setNotifPanelOpen((p) => !p)}
                      className={`shrink-0 p-2 mr-1 rounded-lg transition-all hover:bg-white/70 ${isActive(item.id) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${notifPanelOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path strokeWidth={2.5} d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                </div>
                <StatusBreakdown counts={statusCounts} open={effectiveNotifOpen} />
              </>
            )}
          </div>
        );

        // ── Items with dropdowns ───────────────────────────────────────────
        if (item.hasDropdown && item.subItems) {
          const isOpen         = openDropdown === item.id;
          const isAnySubActive = item.subItems.some((s) => isSubActive(s.path));

          return (
            <div key={item.id} className="space-y-1">
              <button
                onClick={() => {
                  if (isCollapsed) {
                    router.push(item.subItems![0].path);
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
                  {item.subItems.map((sub) => (
                    <Link
                      key={sub.id}
                      href={sub.path}
                      onClick={onLinkClick}
                      className={`flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 ${
                        isSubActive(sub.path)
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                      }`}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }

        // ── Plain link items ───────────────────────────────────────────────
        const active = isActive(item.id);
        return (
          <Link
            key={item.id}
            href={item.path || `/${item.id}`}
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
            {active && !isCollapsed && (
              <span className="absolute right-2 w-1 h-4 bg-blue-600 rounded-full opacity-40" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Main Sidebar ──────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, role, logOut, pharmacistInChargeName, staffName, adminName } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();
  const { isCollapsed, toggleSidebar } = useSidebar();

  const [openDropdown,        setOpenDropdown]        = useState<string | null>(null);
  const [showLogoutConfirm,   setShowLogoutConfirm]   = useState(false);
  const [showEndSessionModal, setShowEndSessionModal]  = useState(false);
  const [isEndingSession,     setIsEndingSession]      = useState(false);
  const [sessionState,        setSessionState]         = useState<'active' | 'ended'>('ended');
  const [mobileOpen,          setMobileOpen]           = useState(false);
  const [notifPanelOpen,      setNotifPanelOpen]       = useState(true);

  const [currentSessionStartTime, setCurrentSessionStartTime] = useState<Date>(() => {
    if (typeof window !== 'undefined') {
      const uid = sessionStorage.getItem('_uid');
      if (uid) {
        const stored = localStorage.getItem(SESSION_START_KEY(uid));
        if (stored) return new Date(stored);
      }
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ urgent: 0, expired: 0, expiring: 0, out: 0, low: 0 });
  const [medicines,    setMedicines]    = useState<Medicine[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);

  const totalAlerts = statusCounts.urgent + statusCounts.expired + statusCounts.expiring + statusCounts.out + statusCounts.low;

  useEffect(() => {
    if (user?.uid) sessionStorage.setItem('_uid', user.uid);
  }, [user?.uid]);

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const closeMobileDrawer = useCallback(() => setMobileOpen(false), []);

  // ── Session state subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToActivityLogs((logs) => {
      const todayEvents = logs
        .filter((log) => {
          const isThisUser = log.staffId === user.uid || log.staffEmail === user.email;
          const isToday    = new Date(log.timestamp) >= todayStart;
          const isSession  = log.type === 'session_ended' || log.type === 'session_started';
          return isThisUser && isToday && isSession;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const lastEvent = todayEvents[todayEvents.length - 1];

      if (!lastEvent) {
        setSessionState('ended');
        const stored = localStorage.getItem(SESSION_START_KEY(user.uid));
        if (stored) {
          const storedDate = new Date(stored);
          if (storedDate >= todayStart) { setCurrentSessionStartTime(storedDate); return; }
        }
        return;
      }

      if (lastEvent.type === 'session_ended') {
        setSessionState('ended');
        const lastStarted = [...todayEvents].reverse().find((e) => e.type === 'session_started');
        if (lastStarted) {
          const t = new Date(lastStarted.timestamp);
          setCurrentSessionStartTime(t);
          localStorage.setItem(SESSION_START_KEY(user.uid), t.toISOString());
        }
      } else if (lastEvent.type === 'session_started') {
        setSessionState('active');
        const t = new Date(lastEvent.timestamp);
        setCurrentSessionStartTime(t);
        localStorage.setItem(SESSION_START_KEY(user.uid), t.toISOString());
      }
    });
    return () => unsubscribe();
  }, [user, todayStart]);

  // ── Medicines listener ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const medicinesPath = getUserPath(user.uid, 'medicines');
    const unsub = onValue(ref(database, medicinesPath), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(([id, v]) => ({ id, ...v }));
        setMedicines(list);
        setStatusCounts(computeStatusCounts(list));
      } else {
        setMedicines([]);
        setStatusCounts({ urgent: 0, expired: 0, expiring: 0, out: 0, low: 0 });
      }
    });
    return () => unsub();
  }, [user]);

  // ── Transactions listener ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const transactionsPath = getUserPath(user.uid, 'transactions');
    const unsub = onValue(ref(database, transactionsPath), (snapshot) => {
      const data = snapshot.val();
      setTransactions(data ? Object.values(data) : []);
    });
    return () => unsub();
  }, [user]);

  // ── Session summary ────────────────────────────────────────────────────────
  const sessionSummaryData = useMemo(() => {
    const sessionTxns  = transactions.filter((t: FirebaseTransaction) => {
      const dt = new Date(t.date);
      return dt >= currentSessionStartTime && dt <= new Date();
    });
    const dispenseTxns = sessionTxns.filter((t) => t.type === 'dispense');
    const saleTxns     = sessionTxns.filter((t) => t.type === 'sale');

    const dispensed  = dispenseTxns.reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0);
    const sold       = saleTxns.reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0);
    const totalUnits = dispensed + sold;

    const dispenseCount = new Set(dispenseTxns.map((t) => t.referenceId).filter(Boolean)).size;
    const saleCount     = new Set(saleTxns.map((t) => t.referenceId).filter(Boolean)).size;
    const totalTxns     = dispenseCount + saleCount;

    const outOfStockCount = medicines.filter((m) => (m.quantity ?? 0) === 0).length;
    const lowStockCount   = medicines.filter((m) => { const min = m.minStock ?? 0; const qty = m.quantity ?? 0; return min > 0 && qty > 0 && qty <= min; }).length;
    const expiredCount    = medicines.filter((m) => m.expirationDate && new Date(m.expirationDate) < new Date()).length;
    const expiringCount   = medicines.filter((m) => { if (!m.expirationDate) return false; const days = Math.floor((new Date(m.expirationDate).getTime() - Date.now()) / 86_400_000); return days >= 0 && days <= 30; }).length;

    const now             = new Date();
    const durationMinutes = Math.max(0, Math.floor((now.getTime() - currentSessionStartTime.getTime()) / 60_000));

    return {
      dispensed, transactions: totalTxns, sold, totalUnits,
      lowStock: lowStockCount, expired: expiredCount, outOfStock: outOfStockCount,
      expiring: expiringCount, totalAlerts: outOfStockCount + expiredCount,
      dispenseCount, saleCount, durationMinutes,
      sessionStart:     currentSessionStartTime.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      sessionEnd:       now.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      sessionStartTime: currentSessionStartTime,
    };
  }, [medicines, transactions, currentSessionStartTime]);

  // ── End Session ────────────────────────────────────────────────────────────
  const handleEndSession = useCallback(async () => {
    if (!user) return;
    setIsEndingSession(true);
    try {
      const now = new Date();
      const sessionDurationMinutes = Math.max(0, Math.floor((now.getTime() - currentSessionStartTime.getTime()) / 60_000));
      const durationHours = Math.floor(sessionDurationMinutes / 60);
      const durationMins  = sessionDurationMinutes % 60;
      const durationStr   = `${durationHours}h ${durationMins}m`;

      const sessionSummary    = `Daily session ended with ${sessionSummaryData.totalUnits} total units (${sessionSummaryData.dispensed} dispensed, ${sessionSummaryData.sold} sales) through ${sessionSummaryData.transactions} transactions. Duration: ${durationStr}. Critical alerts: ${sessionSummaryData.totalAlerts}.`;
      const detailedBreakdown = `Dispense: ${sessionSummaryData.dispenseCount} | Sales: ${sessionSummaryData.saleCount} | Low Stock: ${sessionSummaryData.lowStock} | Expiring: ${sessionSummaryData.expiring}`;

      await logActivity(
        'session_ended',
        user.uid,
        user.email || 'unknown@pharmacy.local',
        `Daily session ended at ${now.toLocaleTimeString('en-PH')}`,
        {
          sessionStartTime: currentSessionStartTime.toISOString(),
          sessionEndTime: now.toISOString(),
          sessionDurationMinutes,
          totalUnitsDispensed: sessionSummaryData.dispensed,
          totalSalesTransactions: sessionSummaryData.saleCount,
          totalDispenseTransactions: sessionSummaryData.dispenseCount,
          totalTransactions: sessionSummaryData.transactions,
          lowStockCount: sessionSummaryData.lowStock,
          expiredCount: sessionSummaryData.expired,
          outOfStockCount: sessionSummaryData.outOfStock,
          totalCriticalAlerts: sessionSummaryData.totalAlerts,
          sessionSummary,
          detailedBreakdown,
        },
        staffName || adminName || user.email || 'Staff Member',
        role || undefined,
      );

      setSessionState('ended');
      setShowEndSessionModal(false);
    } catch (err) {
      console.error('[sidebar] Error ending session:', err);
    } finally {
      setIsEndingSession(false);
    }
  }, [user, currentSessionStartTime, sessionSummaryData, staffName, adminName, role]);

  // ── Start Session ──────────────────────────────────────────────────────────
  const handleCreateNewSession = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();
      setCurrentSessionStartTime(now);
      localStorage.setItem(SESSION_START_KEY(user.uid), now.toISOString());
      setSessionState('active');
      await logActivity(
        'session_started',
        user.uid,
        user.email || 'unknown@pharmacy.local',
        `Session started at ${now.toLocaleTimeString('en-PH')}`,
        { sessionStartTime: now.toISOString() },
        staffName || adminName || user.email || 'Staff Member',
        role || undefined,
      );
    } catch (err) {
      console.error('[sidebar] Error starting new session:', err);
    }
  }, [user, staffName, adminName, role]);

  const handleLogout = async () => {
    try {
      await logOut();
      router.push('/');
    } catch (err) {
      console.error('Logout failed:', err);
      setShowLogoutConfirm(false);
    }
  };

  // ─── Shared footer (session + logout) ────────────────────────────────────
  const footerBlock = (showUserInfo = true) => (
    <div className={`shrink-0 border-t border-slate-200/70 bg-white/90 backdrop-blur-md space-y-2 ${showUserInfo ? 'p-3' : 'p-2'}`}>
      {showUserInfo && (
        <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Staff Session</p>
          <p className="text-xs font-bold text-slate-900 truncate">{pharmacistInChargeName || staffName || user?.email}</p>
          {role === 'staff' && (
            <span className={`inline-flex items-center gap-1 mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${sessionState === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sessionState === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {sessionState === 'active' ? 'Session active' : 'No active session'}
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {role === 'staff' && (
          sessionState === 'ended' ? (
            <button
              onClick={handleCreateNewSession}
              title={!showUserInfo ? 'Start session' : undefined}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-xs font-bold bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
              {showUserInfo && <span>Start session</span>}
            </button>
          ) : (
            <button
              onClick={() => setShowEndSessionModal(true)}
              disabled={isEndingSession}
              title={!showUserInfo ? 'End session' : undefined}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-xs font-bold active:scale-95 transition-all ${isEndingSession ? 'bg-slate-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'}`}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
              {showUserInfo && <span>{isEndingSession ? 'Ending…' : 'End session'}</span>}
            </button>
          )
        )}
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title={!showUserInfo ? 'Sign Out' : undefined}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white text-xs font-bold bg-slate-900 hover:bg-slate-950 active:scale-95 transition-all"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /></svg>
          {showUserInfo && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  );

  const navProps = {
    pathname,
    openDropdown,
    setOpenDropdown,
    isCollapsed,
    router,
    role,
    statusCounts,
    totalAlerts,
    notifPanelOpen,
    setNotifPanelOpen,
  };

  return (
    <>
      {/* ── MOBILE: hamburger fixed top-right ──────────────────────────────── */}
      <button
        onClick={() => setMobileOpen((prev) => !prev)}
        className={`
          lg:hidden fixed top-4 right-4 z-[70]
          flex items-center justify-center
          w-10 h-10 rounded-2xl shadow-lg border
          backdrop-blur-md transition-all duration-300 ease-in-out active:scale-90
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

      {/* ── MOBILE: slide-in drawer from the left ─────────────────────────── */}
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
        <div className="flex items-center h-16 px-4 border-b border-slate-200 shrink-0 gap-3">
          <AppLogo size={36} />
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-800 leading-tight truncate">City Health Pharma</p>
            <p className="text-[10px] text-slate-400 font-medium">Pharmacy Management</p>
          </div>
        </div>

        {/* Nav */}
        <NavContent {...navProps} isCollapsed={false} onLinkClick={closeMobileDrawer} />

        {/* Footer */}
        {footerBlock(true)}
      </div>

      {/* ── DESKTOP: collapsible sidebar ───────────────────────────────────── */}
      <div className={`
        hidden lg:flex flex-col
        sticky top-0 h-screen z-30 shrink-0
        bg-white border-r border-slate-200
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-[72px]' : 'w-64'}
      `}>
        {/* Desktop header */}
        <div className={`border-b border-slate-200/70 flex items-center h-16 shrink-0 transition-all duration-300 ${isCollapsed ? 'px-2 justify-center' : 'px-4'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1 w-full">
              <AppLogo size={40} />
              <button onClick={toggleSidebar} className="p-1 hover:bg-slate-100/80 rounded-lg transition-colors" title="Expand">
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center w-full gap-2">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <AppLogo size={38} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-black gradient-text leading-tight truncate">City Health Pharma</h2>
                  <p className="text-[10px] font-medium leading-none mt-1 text-slate-400">Pharmacy Management</p>
                </div>
              </div>
              <button onClick={toggleSidebar} className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-colors shrink-0" title="Collapse">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
              </button>
            </div>
          )}
        </div>

        {/* Desktop nav */}
        <NavContent {...navProps} />

        {/* Desktop footer */}
        {isCollapsed ? footerBlock(false) : footerBlock(true)}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title="Sign Out?"
        message="Are you sure you want to sign out of your account?"
        confirmText="Sign Out"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      {role === 'staff' && (
        <>
          <EndSessionModal
            isOpen={showEndSessionModal}
            onClose={() => setShowEndSessionModal(false)}
            sessionData={sessionSummaryData}
            isLoading={isEndingSession}
            onConfirm={handleEndSession}
          />
          {isEndingSession && <Processing message="Ending session..." />}
        </>
      )}
    </>
  );
}
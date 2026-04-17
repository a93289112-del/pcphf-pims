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
import { FirebaseTransaction } from '../types';

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

  const isLowStock = minStock > 0 && stock <= minStock;
  let isExpiringSoon = false;
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
    const status = getMedicineStatus(m);
    if      (status === 'out')      out++;
    else if (status === 'expired')  expired++;
    else if (status === 'urgent')   urgent++;
    else if (status === 'expiring') expiring++;
    else if (status === 'low')      low++;
  }
  return { urgent, expired, expiring, out, low };
}

const STATUS_ROWS: {
  key: keyof StatusCounts;
  label: string;
  shortLabel: string;
  dot: string;
  text: string;
  bg: string;
  border: string;
  collapsedBg: string;
  collapsedText: string;
}[] = [
  { key: 'urgent',   label: 'Urgent',       shortLabel: 'URG', dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    collapsedBg: 'bg-red-500',    collapsedText: 'text-white' },
  { key: 'expired',  label: 'Expired',      shortLabel: 'EXP', dot: 'bg-red-400',    text: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-100',    collapsedBg: 'bg-red-400',    collapsedText: 'text-white' },
  { key: 'expiring', label: 'Expiring',     shortLabel: 'EXG', dot: 'bg-orange-400', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', collapsedBg: 'bg-orange-400', collapsedText: 'text-white' },
  { key: 'out',      label: 'Out of Stock', shortLabel: 'OUT', dot: 'bg-slate-500',  text: 'text-slate-600',  bg: 'bg-slate-100', border: 'border-slate-200',  collapsedBg: 'bg-slate-500',  collapsedText: 'text-white' },
  { key: 'low',      label: 'Low Stock',    shortLabel: 'LOW', dot: 'bg-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', collapsedBg: 'bg-yellow-400', collapsedText: 'text-slate-900' },
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

function SidebarLogo({ isCollapsed }: { isCollapsed: boolean }) {
  if (isCollapsed) return <AppLogo size={48} />;
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <AppLogo size={42} />
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-black gradient-text leading-tight truncate">City Health Pharma</h2>
        <p className="text-[10px] font-medium leading-none mt-1 text-slate-400">Pharmacy Management</p>
      </div>
    </div>
  );
}

function NotifBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count === 0) return null;
  const label = count > 99 ? '99+' : String(count);
  if (collapsed) {
    return (
      <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-4.5 h-4.5 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold shadow-md border-2 border-white z-10">
        {label}
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold shadow-sm shrink-0">
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
          <span className={`text-xs font-bold shrink-0 ml-2 min-w-5 text-center px-1.5 py-0.5 rounded-md ${row.bg} ${row.text} border ${row.border}`}>
            {counts[row.key]}
          </span>
        </Link>
      ))}
    </div>
  );
}

function CollapsedStatusPills({ counts }: { counts: StatusCounts }) {
  const activeRows = STATUS_ROWS.filter((r) => counts[r.key] > 0);
  if (activeRows.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-1 mt-1 w-full px-2">
      {activeRows.map((row) => (
        <Link
          key={row.key}
          href={`/notifications?tab=${row.key}`}
          title={`${row.label}: ${counts[row.key]}`}
          className={`w-full flex items-center justify-center gap-1 py-1 rounded-lg ${row.collapsedBg} ${row.collapsedText} hover:opacity-80 transition-all`}
        >
          <span className="text-[9px] font-black tracking-wide leading-none">{row.shortLabel}</span>
          <span className="text-[9px] font-black leading-none">{counts[row.key]}</span>
        </Link>
      ))}
    </div>
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
  const [currentSessionStartTime, setCurrentSessionStartTime] = useState<Date>(() => {
    // Try to restore from localStorage on mount
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

  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    urgent: 0, expired: 0, expiring: 0, out: 0, low: 0,
  });
  const [medicines,     setMedicines]     = useState<Medicine[]>([]);
  const [transactions,  setTransactions]  = useState<FirebaseTransaction[]>([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(true);

  // Keep uid in sessionStorage so we can read it before the auth hook resolves
  useEffect(() => {
    if (user?.uid) sessionStorage.setItem('_uid', user.uid);
  }, [user?.uid]);

  // ── todayStart / todayEnd ────────────────────────────────────────────────
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const todayEnd = useMemo(() => new Date(todayStart.getTime() + 86_400_000), [todayStart]);

  // ── Session state subscription ────────────────────────────────────────────
  // Reads all session_started / session_ended logs for today and determines
  // current state from the LAST event. Stores start time in localStorage so
  // it survives page refreshes.
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToActivityLogs((logs) => {
      const todayEvents = logs
        .filter((log) => {
          // Match by staffId OR email as fallback
          const isThisUser = log.staffId === user.uid || log.staffEmail === user.email;
          const isToday    = new Date(log.timestamp) >= todayStart;
          const isSession  = log.type === 'session_ended' || log.type === 'session_started';
          return isThisUser && isToday && isSession;
        })
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const lastEvent = todayEvents[todayEvents.length - 1];

      if (!lastEvent) {
        // No events yet today — new user, session should be in 'ended' state
        setSessionState('ended');
        const stored = localStorage.getItem(SESSION_START_KEY(user.uid));
        if (stored) {
          const storedDate = new Date(stored);
          // Only use it if it's from today
          if (storedDate >= todayStart) {
            setCurrentSessionStartTime(storedDate);
            return;
          }
        }
        // Nothing stored — wait for user to click "Start session"
        return;
      }

      if (lastEvent.type === 'session_ended') {
        setSessionState('ended');
        // Keep the last session_started time for reference
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

  const totalAlerts = statusCounts.urgent + statusCounts.expired + statusCounts.expiring + statusCounts.out + statusCounts.low;
  const hasAlerts   = STATUS_ROWS.some((r) => statusCounts[r.key] > 0);

  // ── Real-time medicine listener ─────────────────────────────────────────────
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

  // ── Real-time transactions listener ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const transactionsPath = getUserPath(user.uid, 'transactions');
    const unsub = onValue(ref(database, transactionsPath), (snapshot) => {
      const data = snapshot.val();
      setTransactions(data ? Object.values(data) : []);
    });
    return () => unsub();
  }, [user]);

  const effectiveNotifPanelOpen = !isCollapsed && notifPanelOpen;

  // ── Session summary data (static snapshot — duration is live in modal) ─────
  const sessionSummaryData = useMemo(() => {
    const todayTxns     = transactions.filter((t: FirebaseTransaction) => {
      const dt = new Date(t.date);
      return dt >= todayStart && dt < todayEnd;
    });
    const dispenseTxns  = todayTxns.filter((t) => t.type === 'dispense');
    const saleTxns      = todayTxns.filter((t) => t.type === 'sale');

    const dispensed  = dispenseTxns.reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0);
    const sold       = saleTxns.reduce((s, t) => s + Math.abs(Number(t.quantity) || 0), 0);
    const totalUnits = dispensed + sold;

    const dispenseCount = new Set(dispenseTxns.map((t) => t.referenceId).filter(Boolean)).size;
    const saleCount     = new Set(saleTxns.map((t) => t.referenceId).filter(Boolean)).size;
    const totalTxns     = dispenseCount + saleCount;

    const outOfStockCount = medicines.filter((m) => (m.quantity ?? 0) === 0).length;
    const lowStockCount   = medicines.filter((m) => {
      const min = m.minStock ?? 0;
      const qty = m.quantity ?? 0;
      return min > 0 && qty > 0 && qty <= min;
    }).length;
    const expiredCount  = medicines.filter((m) => m.expirationDate && new Date(m.expirationDate) < new Date()).length;
    const expiringCount = medicines.filter((m) => {
      if (!m.expirationDate) return false;
      const days = Math.floor((new Date(m.expirationDate).getTime() - Date.now()) / 86_400_000);
      return days >= 0 && days <= 30;
    }).length;

    const now = new Date();
    // Duration in minutes — used as fallback only; modal computes live from sessionStartTime
    const durationMinutes = Math.max(0, Math.floor((now.getTime() - currentSessionStartTime.getTime()) / 60_000));

    return {
      dispensed,
      transactions: totalTxns,
      sold,
      totalUnits,
      lowStock: lowStockCount,
      expired: expiredCount,
      outOfStock: outOfStockCount,
      expiring: expiringCount,
      totalAlerts: outOfStockCount + expiredCount,
      dispenseCount,
      saleCount,
      durationMinutes,
      sessionStart: currentSessionStartTime.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      sessionEnd:   now.toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' }),
      // ── KEY: pass the actual Date object so the modal can count live ──
      sessionStartTime: currentSessionStartTime,
    };
  }, [medicines, transactions, todayStart, todayEnd, currentSessionStartTime]);

  // ── End Session ─────────────────────────────────────────────────────────────
  const handleEndSession = useCallback(async () => {
    if (!user) return;
    setIsEndingSession(true);
    try {
      const now = new Date();
      const sessionDurationMinutes = Math.max(0, Math.floor((now.getTime() - currentSessionStartTime.getTime()) / 60_000));
      const durationHours = Math.floor(sessionDurationMinutes / 60);
      const durationMins  = sessionDurationMinutes % 60;
      const durationStr   = `${durationHours}h ${durationMins}m`;

      const sessionSummary = `Daily session ended with ${sessionSummaryData.totalUnits} total units (${sessionSummaryData.dispensed} dispensed, ${sessionSummaryData.sold} sales) through ${sessionSummaryData.transactions} transactions. Duration: ${durationStr}. Critical alerts: ${sessionSummaryData.totalAlerts} (${sessionSummaryData.outOfStock} out-of-stock, ${sessionSummaryData.expired} expired).`;
      const detailedBreakdown = `Dispense Transactions: ${sessionSummaryData.dispenseCount} | Sales Transactions: ${sessionSummaryData.saleCount} | Low Stock Items: ${sessionSummaryData.lowStock} | Expiring Soon: ${sessionSummaryData.expiring}`;

      await logActivity(
        'session_ended',
        user.uid,
        user.email || 'unknown@pharmacy.local',
        `Daily session ended at ${now.toLocaleTimeString('en-PH')}`,
        {
          sessionStartTime:             currentSessionStartTime.toISOString(),
          sessionEndTime:               now.toISOString(),
          sessionDurationMinutes,
          totalUnitsDispensed:          sessionSummaryData.dispensed,
          totalSalesTransactions:       sessionSummaryData.saleCount,
          totalDispenseTransactions:    sessionSummaryData.dispenseCount,
          totalTransactions:            sessionSummaryData.transactions,
          lowStockCount:                sessionSummaryData.lowStock,
          expiredCount:                 sessionSummaryData.expired,
          outOfStockCount:              sessionSummaryData.outOfStock,
          totalCriticalAlerts:          sessionSummaryData.totalAlerts,
          sessionSummary,
          detailedBreakdown,
        },
        staffName || adminName || user.email || 'Staff Member',
        role || undefined,
      );

      // Optimistically update UI without waiting for subscription roundtrip
      setSessionState('ended');
      setShowEndSessionModal(false);
    } catch (err) {
      console.error('[sidebar] Error ending session:', err);
    } finally {
      setIsEndingSession(false);
    }
  }, [user, currentSessionStartTime, sessionSummaryData, staffName, adminName, role]);

  // ── Start Session ───────────────────────────────────────────────────────
  const handleCreateNewSession = useCallback(async () => {
    if (!user) return;
    try {
      const now = new Date();

      // Set start time so the modal counter is correct immediately
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

  // ── Menu items ──────────────────────────────────────────────────────────────
  const menuItems = [
    { id: 'dashboard',     label: 'Dashboard',     path: '/staff-dashboard' },
    { id: 'inventory',     label: 'Inventory',      hasDropdown: true },
    { id: 'medicines',     label: 'Medicines',      hasDropdown: true },
    { id: 'dispense',      label: 'Dispense',       hasDropdown: true },
    { id: 'pos',           label: 'Point of Sale',  hasDropdown: true },
    { id: 'notifications', label: 'Notifications' },
    { id: 'reports',       label: 'Reports' },
  ];

  const isItemActive = (id: string): boolean => {
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

  const getIcon = (id: string) => {
    const p = { className: 'w-5 h-5 shrink-0', strokeWidth: '1.5', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' };
    switch (id) {
      case 'dashboard':     return <svg {...p}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>;
      case 'inventory':     return <svg {...p}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>;
      case 'medicines':     return <svg {...p}><rect x="4.5" y="9" width="15" height="6" rx="3" /><line x1="12" y1="9" x2="12" y2="15" /></svg>;
      case 'dispense':      return <svg {...p}><path d="M7 17.5c0 2.485 2.015 4.5 4.5 4.5s4.5-2.015 4.5-4.5C16 14 11.5 8 11.5 8S7 14 7 17.5z" /><line x1="11.5" y1="2" x2="11.5" y2="6" /><line x1="8.5" y1="4" x2="14.5" y2="4" /></svg>;
      case 'pos':           return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5" /><line x1="3" y1="11" x2="21" y2="11" /><circle cx="18" cy="16" r="1" fill="currentColor" /></svg>;
      case 'notifications': return <svg {...p}><path d="M6 10a6 6 0 1112 0v4l1.5 2h-15L6 14v-4z" /><path d="M10 19a2 2 0 004 0" /></svg>;
      case 'reports':       return <svg {...p}><line x1="3" y1="21" x2="21" y2="21" /><rect x="5" y="13" width="4" height="8" rx="0.5" /><rect x="10" y="9" width="4" height="12" rx="0.5" /><rect x="15" y="5" width="4" height="16" rx="0.5" /></svg>;
      default: return null;
    }
  };

  const chevron = (id: string) => (
    <svg className={`w-4 h-4 transition-transform shrink-0 ${openDropdown === id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path strokeWidth={1.5} d="M6 9l6 6 6-6" />
    </svg>
  );

  const dropdownBtnClass = (id: string) =>
    `w-full flex items-center justify-between gap-3 rounded-xl transition-all border ${isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'} ${
      isItemActive(id)
        ? 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm'
        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'
    }`;

  return (
    <>
      {/* Mobile toggle */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <button onClick={toggleSidebar} className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-lg text-slate-600 active:scale-95 transition-all">
          {isCollapsed ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          )}
        </button>
      </div>

      <div className={`fixed inset-y-0 left-0 z-40 bg-white bg-opacity-95 backdrop-blur-xl border-r border-slate-200 shadow-xl lg:shadow-none lg:sticky lg:top-0 lg:h-screen lg:z-30 transition-all duration-300 ease-in-out flex flex-col ${isCollapsed ? 'w-0 lg:w-20 -translate-x-full lg:translate-x-0' : 'w-64 lg:w-64 translate-x-0 lg:translate-x-0'}`}>

        {/* Logo / Header */}
        <div className={`border-b border-slate-200 border-opacity-70 flex items-center h-20 relative transition-all duration-300 ${isCollapsed ? 'p-2 lg:p-2' : 'p-4'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center justify-center w-full gap-1">
              <SidebarLogo isCollapsed={true} />
              <button onClick={toggleSidebar} className="p-1 hover:bg-slate-100/80 rounded-lg transition-colors" title="Expand sidebar">
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          ) : (
            <>
              <SidebarLogo isCollapsed={false} />
              <button onClick={toggleSidebar} className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-colors shrink-0 ml-2" title="Collapse sidebar">
                <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round"><path strokeWidth={1.5} d="M15 19l-7-7 7-7" /></svg>
              </button>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto transition-all duration-300">

          {role === 'admin' && (
            <Link
              href="/admin-dashboard"
              className={`flex items-center gap-3 rounded-xl transition-all border text-violet-600 bg-violet-50 border-violet-100 shadow-sm hover:bg-violet-100 mb-4 ${isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'}`}
              title={isCollapsed ? 'Admin Panel' : undefined}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <circle cx="12" cy="11" r="3" />
                <path d="M7 17a5 5 0 0 1 10 0" />
              </svg>
              {!isCollapsed && <span className="text-sm font-black uppercase tracking-wider">Admin Panel</span>}
            </Link>
          )}

          {menuItems.map((item) => {
            // ── Inventory ──────────────────────────────────────────────────
            if (item.id === 'inventory' && item.hasDropdown) {
              return (
                <div key={item.id}>
                  <button onClick={() => isCollapsed ? router.push('/inventory') : setOpenDropdown(openDropdown === item.id ? null : item.id)} className={dropdownBtnClass(item.id)} title={isCollapsed ? item.label : undefined}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">{getIcon(item.id)}{!isCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}</div>
                    {!isCollapsed && chevron(item.id)}
                  </button>
                  {openDropdown === item.id && !isCollapsed && (
                    <div className="space-y-1 mt-1 ml-4">
                      <Link href="/inventory" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/inventory' || (pathname.startsWith('/inventory/') && !pathname.startsWith('/inventory-records')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>
                        Medicine Inventory
                      </Link>
                      <Link href="/inventory-records" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/inventory-records' || pathname.startsWith('/inventory-records/') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /><line x1="9" y1="20" x2="11" y2="20" /></svg>
                        Inventory Records
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            // ── POS ────────────────────────────────────────────────────────
            if (item.id === 'pos' && item.hasDropdown) {
              return (
                <div key={item.id}>
                  <button onClick={() => isCollapsed ? router.push('/pos') : setOpenDropdown(openDropdown === item.id ? null : item.id)} className={dropdownBtnClass(item.id)} title={isCollapsed ? item.label : undefined}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">{getIcon(item.id)}{!isCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}</div>
                    {!isCollapsed && chevron(item.id)}
                  </button>
                  {openDropdown === item.id && !isCollapsed && (
                    <div className="space-y-1 mt-1 ml-4">
                      <Link href="/pos" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/pos' || (pathname.startsWith('/pos/') && !pathname.startsWith('/pos-history')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1.5" /><line x1="3" y1="11" x2="21" y2="11" /><circle cx="18" cy="16" r="1" fill="currentColor" /></svg>
                        Sales
                      </Link>
                      <Link href="/pos-history" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/pos-history' || pathname.startsWith('/pos-history/') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12h8M12 8v8" /></svg>
                        Sales History
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            // ── Medicines ──────────────────────────────────────────────────
            if (item.id === 'medicines' && item.hasDropdown) {
              return (
                <div key={item.id}>
                  <button onClick={() => isCollapsed ? router.push('/medicines') : setOpenDropdown(openDropdown === item.id ? null : item.id)} className={dropdownBtnClass(item.id)} title={isCollapsed ? item.label : undefined}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">{getIcon(item.id)}{!isCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}</div>
                    {!isCollapsed && chevron(item.id)}
                  </button>
                  {openDropdown === item.id && !isCollapsed && (
                    <div className="space-y-1 mt-1 ml-4">
                      <Link href="/medicines" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${(pathname === '/medicines' || (pathname.startsWith('/medicines/') && !pathname.startsWith('/medicines/add-medicine'))) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
                        View All
                      </Link>
                      <Link href="/medicines/add-medicine" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/medicines/add-medicine' || pathname.startsWith('/medicines/add-medicine/') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        Add Medicines
                      </Link>
                      <button onClick={() => { router.push('/stock-adjustments'); setOpenDropdown(null); }} className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/stock-adjustments' || pathname.startsWith('/stock-adjustments/') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" viewBox="0 0 24 24"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="8" cy="6" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" /><circle cx="16" cy="12" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="18" r="2" fill="white" stroke="currentColor" strokeWidth="1.5" /></svg>
                        Stock Adjustments
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // ── Dispense ───────────────────────────────────────────────────
            if (item.id === 'dispense' && item.hasDropdown) {
              return (
                <div key={item.id}>
                  <button onClick={() => isCollapsed ? router.push('/dispense') : setOpenDropdown(openDropdown === item.id ? null : item.id)} className={dropdownBtnClass(item.id)} title={isCollapsed ? item.label : undefined}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">{getIcon(item.id)}{!isCollapsed && <span className="text-sm font-medium truncate">{item.label}</span>}</div>
                    {!isCollapsed && chevron(item.id)}
                  </button>
                  {openDropdown === item.id && !isCollapsed && (
                    <div className="space-y-1 mt-1 ml-4">
                      <Link href="/dispense" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dispense' || (pathname.startsWith('/dispense/') && !pathname.startsWith('/dispensing-records')) ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                        Dispense Medicine
                      </Link>
                      <Link href="/dispensing-records" className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dispensing-records' || pathname.startsWith('/dispensing-records/') ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                        Dispensing Records
                      </Link>
                    </div>
                  )}
                </div>
              );
            }

            // ── Notifications ──────────────────────────────────────────────
            if (item.id === 'notifications') {
              return (
                <div key={item.id}>
                  {isCollapsed ? (
                    <div className="flex flex-col items-center gap-0">
                      <Link
                        href="/notifications"
                        title={`Notifications${totalAlerts > 0 ? ` — ${totalAlerts} alerts` : ''}`}
                        className={`relative w-full flex items-center justify-center rounded-xl transition-all border ${isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'} ${isItemActive(item.id) ? 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'}`}
                      >
                        {getIcon(item.id)}
                        <NotifBadge count={totalAlerts} collapsed={true} />
                      </Link>
                      <CollapsedStatusPills counts={statusCounts} />
                    </div>
                  ) : (
                    <>
                      <div className={`flex items-center gap-1 rounded-xl border transition-all ${isItemActive(item.id) ? 'bg-blue-50 border-blue-100 shadow-sm' : 'border-transparent hover:bg-slate-100/80'}`}>
                        <Link href="/notifications" className={`flex items-center gap-3 flex-1 min-w-0 rounded-xl transition-colors ${isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'} ${isItemActive(item.id) ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'}`}>
                          <span className="relative shrink-0">{getIcon(item.id)}</span>
                          <span className="text-sm font-medium truncate">{item.label}</span>
                          <NotifBadge count={totalAlerts} collapsed={false} />
                        </Link>
                        {hasAlerts && (
                          <button onClick={() => setNotifPanelOpen((prev) => !prev)} className={`shrink-0 p-2 mr-1 rounded-lg transition-all hover:bg-white hover:bg-opacity-70 ${isItemActive(item.id) ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`} title={notifPanelOpen ? 'Collapse breakdown' : 'Expand breakdown'}>
                            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${notifPanelOpen ? 'rotate-180' : 'rotate-0'}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path strokeWidth={2.5} d="M6 9l6 6 6-6" /></svg>
                          </button>
                        )}
                      </div>
                      <StatusBreakdown counts={statusCounts} open={effectiveNotifPanelOpen} />
                    </>
                  )}
                </div>
              );
            }

            // ── Default link ───────────────────────────────────────────────
            return (
              <Link key={item.id} href={item.path || `/${item.id}`}
                className={`flex items-center gap-3 rounded-xl transition-all border ${isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'} ${isItemActive(item.id) ? 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'}`}
                title={isCollapsed ? item.label : undefined}
              >
                {getIcon(item.id)}
                {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer / session controls */}
        <div className={`shrink-0 border-t border-slate-200 border-opacity-70 bg-white bg-opacity-90 backdrop-blur-lg space-y-2 transition-all duration-300 ${isCollapsed ? 'p-2 lg:p-2' : 'p-3'}`}>
          {!isCollapsed && (
            <div className="px-3 py-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Staff Session</p>
              <p className="text-xs font-semibold text-slate-900 truncate">{pharmacistInChargeName || staffName || user?.email}</p>
            </div>
          )}
          <div className="flex flex-col w-full gap-2">
            {role === 'staff' && (
              <>
                {sessionState === 'ended' ? (
                  // ── Start Session button ──────────────────────────────────────
                  <button
                    onClick={handleCreateNewSession}
                    className={`w-full text-white font-semibold rounded-xl hover:bg-green-600 active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 bg-green-500 ${isCollapsed ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-xs'}`}
                    title={isCollapsed ? 'Start session' : undefined}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M12 4v16m8-8H4" />
                    </svg>
                    {!isCollapsed && <span>Start session</span>}
                  </button>
                ) : (
                  // ── End Session button ─────────────────────────────────────
                  <button
                    onClick={() => setShowEndSessionModal(true)}
                    disabled={isEndingSession}
                    className={`w-full text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${isEndingSession ? 'bg-slate-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600 active:scale-95'} ${isCollapsed ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-xs'}`}
                    title={isCollapsed ? 'End session' : undefined}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                    </svg>
                    {!isCollapsed && <span>{isEndingSession ? 'Ending…' : 'End session'}</span>}
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className={`w-full text-white font-semibold rounded-xl hover:bg-slate-950 transition-all duration-300 flex items-center justify-center gap-2 bg-slate-900 ${isCollapsed ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-xs'}`}
              title={isCollapsed ? 'Sign Out' : undefined}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M16 17l5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              </svg>
              {!isCollapsed && <span className="ml-1">Sign Out</span>}
            </button>
          </div>
        </div>
      </div>

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
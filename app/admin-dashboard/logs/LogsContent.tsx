'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { subscribeToActivityLogs, type ActivityLog, type ActivityType, type ActivityLogDetails } from '@/lib/services/activity-logs';
import AdminSessionSummaryModal from '@/lib/components/admin-session-summary-modal';

// ── Tiny inline SVG icons ────────────────────────────────────────────────────
const Icon = {
  Activity: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  Dispense: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
    </svg>
  ),
  Sale: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  Adjustment: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  Up: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 15l-6-6-6 6" />
    </svg>
  ),
  Down: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  User: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  Filter: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  ChevronDown: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  X: () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Pill: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" />
    </svg>
  ),
  Alert: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  TrendUp: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  Package: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Clock: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  ),
};

// ── Mini bar chart (pure CSS/SVG, no library) ──────────────────────────────
function MiniBarChart({ data, color = '#3b82f6' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <div
            className="w-full rounded-sm transition-all duration-500"
            style={{ height: `${(d.value / max) * 52}px`, backgroundColor: color, opacity: d.value === 0 ? 0.15 : 0.85 }}
          />
          <span className="text-[9px] text-slate-400 font-medium truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────
function Sparkline({ values, color = '#3b82f6' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 80, h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Donut chart (SVG) ───────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const r = 36, cx = 44, cy = 44, stroke = 14;
  const circ = 2 * Math.PI * r;

  // Pre-compute offsets before render
  const arcs = segments.map((seg, i) => {
    const dash = (seg.value / total) * circ;
    const offset = segments.slice(0, i).reduce((sum, s) => sum + (s.value / total) * circ, 0);
    return { ...seg, dash, offset };
  });

  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={arc.color}
          strokeWidth={stroke}
          strokeDasharray={`${arc.dash} ${circ - arc.dash}`}
          strokeDashoffset={-arc.offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      ))}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="800" fill="#0f172a">
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" dominantBaseline="middle" fontSize="7" fontWeight="600" fill="#94a3b8">
        TOTAL
      </text>
    </svg>
  );
}

// ── Staff comparison bar chart ─────────────────────────────────────────────
function StaffComparisonChart({
  staffStats,
}: {
  staffStats: Record<string, { dispense: number; sale: number; adjustment: number; total: number; email: string; name: string }>;
}) {
  const entries = Object.entries(staffStats).sort((a, b) => b[1].total - a[1].total).slice(0, 6);
  if (entries.length === 0) return <p className="text-sm text-slate-400 text-center py-6">No staff data</p>;
  const max = Math.max(...entries.map(([, s]) => s.total), 1);
  const segments = [
    { key: 'dispense' as const,    color: '#3b82f6', label: 'Dispense' },
    { key: 'sale' as const,        color: '#10b981', label: 'Sale' },
    { key: 'adjustment' as const,  color: '#f59e0b', label: 'Adjust' },
  ];
  return (
    <div className="space-y-3">
      {entries.map(([uid, s]) => {
        const displayName = s.name || s.email.split('@')[0];
        return (
          <div key={uid} className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-black shrink-0">
              {displayName[0]?.toUpperCase()}
            </div>
            <span className="text-xs font-medium text-slate-700 w-24 shrink-0 truncate" title={displayName}>{displayName}</span>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden flex">
              {segments.map(seg => {
                const pct = (s[seg.key] / max) * 100;
                return pct > 0 ? (
                  <div key={seg.key} title={`${seg.label}: ${s[seg.key]}`} className="h-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: seg.color }} />
                ) : null;
              })}
            </div>
            <span className="text-xs font-black text-slate-700 w-7 text-right shrink-0">{s.total}</span>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1">
        {segments.map(seg => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }} />
            <span className="text-[10px] text-slate-400 font-medium">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Details Modal ──────────────────────────────────────────────────────────
function DetailsModal({
  isOpen,
  onClose,
  log,
}: {
  isOpen: boolean;
  onClose: () => void;
  log: {
    action: string;
    details: ActivityLogDetails | undefined;
    staffName: string;
    timestamp: string;
    type: string;
  } | null;
}) {
  if (!isOpen || !log) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-pointer" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        style={{ animation: 'modalPop 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.88) translateY(16px); }
            to   { opacity: 1; transform: scale(1)    translateY(0);    }
          }
        `}</style>
        <div className="h-2 bg-gradient-to-r from-blue-400 to-blue-600" />
        <div className="px-6 pt-7 pb-6">
          <h2 className="text-xl font-black text-slate-900 mb-4">Activity Details</h2>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Staff Member</p>
              <p className="text-sm font-semibold text-slate-900">{log.staffName}</p>
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Date & Time</p>
              <p className="text-sm font-semibold text-slate-900">{new Date(log.timestamp).toLocaleString()}</p>
            </div>
            
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Action</p>
              <p className="text-sm text-slate-700">{log.action}</p>
            </div>

            {log.details && Object.keys(log.details).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Details</p>
                <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                  {Object.entries(log.details).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-xs font-medium text-slate-600">{key}:</span>
                      <span className="text-xs text-slate-900 font-semibold">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-slate-900 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LogsContent() {
  const { user } = useAuth();

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'staff'>('all');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('logs');
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [selectedSessionData, setSelectedSessionData] = useState<{
    details: ActivityLogDetails;
    staffName: string;
    sessionEndTime: string;
  } | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLogDetails, setSelectedLogDetails] = useState<{
    action: string;
    details: ActivityLogDetails | undefined;
    staffName: string;
    timestamp: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    
    // Subscribe to activity logs
    const unsubscribe = subscribeToActivityLogs((logs) => {
      setActivityLogs(logs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // ── Filtered logs ────────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
      const matchesType = typeFilter === 'all' || log.type === typeFilter;
      const matchesStaff = selectedStaff === 'all' || log.staffId === selectedStaff;
      let matchesRole = true;
      if (roleFilter !== 'all') {
        // Use userRole field from the log, defaulting to 'staff' if not set
        const logRole = log.userRole || 'staff';
        matchesRole = logRole === roleFilter;
      }
      let matchesDate = true;
      if (filterMonth || filterYear) {
        const d = new Date(log.timestamp);
        if (filterYear && d.getFullYear() !== parseInt(filterYear)) matchesDate = false;
        if (filterMonth && d.getMonth() + 1 !== parseInt(filterMonth)) matchesDate = false;
      }
      return matchesType && matchesStaff && matchesRole && matchesDate;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityLogs, typeFilter, selectedStaff, roleFilter, filterMonth, filterYear]);

  // ── Analytics ────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const dispenses = filteredLogs.filter(l => l.type === 'medicine_dispensed');
    const sales = filteredLogs.filter(l => l.type === 'medicine_sold');
    const staffCreated = filteredLogs.filter(l => l.type === 'staff_created');
    const staffDisabled = filteredLogs.filter(l => l.type === 'staff_disabled');

    // Per-staff breakdown (exclude admins)
    const staffStats: Record<string, { dispense: number; sale: number; adjustment: number; total: number; email: string; name: string }> = {};
    filteredLogs.forEach(l => {
      // Skip admin accounts
      const logRole = l.userRole || 'staff';
      if (logRole === 'admin') return;
      
      const uid = l.staffId || 'system';
      const staffName = l.staffName || l.staffEmail || uid;
      if (!staffStats[uid]) staffStats[uid] = { dispense: 0, sale: 0, adjustment: 0, total: 0, email: l.staffEmail || uid, name: staffName };
      if (l.type === 'medicine_dispensed') staffStats[uid].dispense++;
      else if (l.type === 'medicine_sold') staffStats[uid].sale++;
      else if (l.type === 'stock_deducted' || l.type === 'stock_adjusted') staffStats[uid].adjustment++;
      staffStats[uid].total++;
    });

    // Daily volume last 14 days
    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i));
      return d.toISOString().slice(0, 10);
    });
    const dailyVolume = last14.map(day => ({
      label: new Date(day).toLocaleDateString('en', { weekday: 'short' }).slice(0, 1),
      value: filteredLogs.filter(l => l.timestamp?.slice(0, 10) === day).length,
    }));

    // Sparkline (last 7 days)
    const spark = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return filteredLogs.filter(l => l.timestamp?.slice(0, 10) === d.toISOString().slice(0, 10)).length;
    });

    return { dispenses, sales, staffCreated, staffDisabled, staffStats, dailyVolume, spark };
  }, [filteredLogs]);

  const typeBadge = (type: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      medicine_dispensed: { cls: 'bg-blue-50 text-blue-700 border border-blue-100', icon: <Icon.Dispense />, label: 'Dispensed' },
      medicine_sold:      { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-100', icon: <Icon.Sale />, label: 'Sold' },
      medicine_added:     { cls: 'bg-green-50 text-green-700 border border-green-100', icon: <Icon.Pill />, label: 'Medicine Added' },
      stock_deducted:     { cls: 'bg-amber-50 text-amber-700 border border-amber-100', icon: <Icon.Adjustment />, label: 'Stock Deducted' },
      stock_adjusted:     { cls: 'bg-orange-50 text-orange-700 border border-orange-100', icon: <Icon.Adjustment />, label: 'Adjusted' },
      medicine_restocked: { cls: 'bg-teal-50 text-teal-700 border border-teal-100', icon: <Icon.Package />, label: 'Restocked' },
      staff_created:      { cls: 'bg-purple-50 text-purple-700 border border-purple-100', icon: <Icon.User />, label: 'Staff Created' },
      staff_disabled:     { cls: 'bg-red-50 text-red-700 border border-red-100', icon: <Icon.User />, label: 'Staff Disabled' },
      admin_login:        { cls: 'bg-rose-50 text-rose-700 border border-rose-100', icon: <Icon.User />, label: 'Admin Login' },
      admin_logout:       { cls: 'bg-rose-100 text-rose-800 border border-rose-200', icon: <Icon.User />, label: 'Admin Logout' },
      staff_login:        { cls: 'bg-cyan-50 text-cyan-700 border border-cyan-100', icon: <Icon.User />, label: 'Staff Login' },
      staff_logout:       { cls: 'bg-slate-50 text-slate-700 border border-slate-100', icon: <Icon.User />, label: 'Staff Logout' },
      password_changed:   { cls: 'bg-indigo-50 text-indigo-700 border border-indigo-100', icon: <Icon.Alert />, label: 'Password Changed' },
    };
    const cfg = map[type] || { cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: null, label: type };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
        {cfg.icon}{cfg.label}
      </span>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading activity logs…</p>
      </div>
    </div>
  );

  const hasFilters = typeFilter !== 'all' || selectedStaff !== 'all' || roleFilter !== 'all' || filterMonth || filterYear !== new Date().getFullYear().toString();

  return (
    <div className="min-h-screen bg-[#f8f8f7] w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── Header (untouched) ── */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">System Activity Logs</h1>
          <p className="text-slate-500">Full audit trail of all inventory and sales transactions</p>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-1 mb-8 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {(['overview', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
                activeTab === tab
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'overview' ? 'Overview & Charts' : 'Activity Logs'}
            </button>
          ))}
        </div>

        {/* ── Filter bar ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 text-slate-400">
            <Icon.Filter />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Filters</span>
            {hasFilters && (
              <button
                onClick={() => { setTypeFilter('all'); setSelectedStaff('all'); setRoleFilter('all'); setFilterMonth(''); setFilterYear(new Date().getFullYear().toString()); }}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 border border-slate-200 rounded-lg hover:border-slate-300 transition-all"
              >
                <Icon.X /> Clear all
              </button>
            )}
          </div>
          <div className="px-5 py-4 flex flex-wrap gap-3 items-center">
            {/* Staff */}
            <div className="relative">
              <select
                value={selectedStaff}
                onChange={(e) => setSelectedStaff(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Staff</option>
                {Array.from(new Set(activityLogs.map(l => l.staffId))).filter(uid => {
                  // Filter out the current admin user by both uid and email
                  if (!user) return true;
                  const staffRecord = activityLogs.find(l => l.staffId === uid);
                  return uid !== user.uid && staffRecord?.staffEmail !== user.email;
                }).map(uid => {
                  const staffRecord = activityLogs.find(l => l.staffId === uid);
                  const staffName = staffRecord?.staffName || staffRecord?.staffEmail?.split('@')[0] || uid;
                  return <option key={uid} value={uid}>{staffName}</option>;
                })}
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.User /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Role */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'staff')}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.User /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Type */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | ActivityType)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="medicine_dispensed">Dispensed</option>
                <option value="medicine_sold">POS Sale</option>
                <option value="medicine_added">Medicine Added</option>
                <option value="stock_deducted">Stock Deducted</option>
                <option value="stock_adjusted">Stock Adjusted</option>
                <option value="medicine_restocked">Restocked</option>
                <option value="staff_created">Staff Created</option>
                <option value="staff_disabled">Staff Disabled</option>
                <option value="admin_login">Admin Login</option>
                <option value="admin_logout">Admin Logout</option>
                <option value="staff_login">Staff Login</option>
                <option value="staff_logout">Staff Logout</option>
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.Activity /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Month */}
            <div className="relative">
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="">All Months</option>
                {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.Calendar /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Year */}
            <div className="relative">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.Calendar /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            <span className="ml-auto text-xs text-slate-400 font-medium">{filteredLogs.length} events</span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Events',
                  value: filteredLogs.length,
                  sub: 'in selected period',
                  color: 'text-slate-900',
                  spark: analytics.spark,
                  sparkColor: '#64748b',
                },
                {
                  label: 'Dispenses',
                  value: analytics.dispenses.length,
                  sub: 'medication given out',
                  color: 'text-blue-600',
                  spark: analytics.spark,
                  sparkColor: '#3b82f6',
                },
                {
                  label: 'POS Sales',
                  value: analytics.sales.length,
                  sub: 'units sold',
                  color: 'text-emerald-600',
                  spark: analytics.spark,
                  sparkColor: '#10b981',
                },
                {
                  label: 'Staff Created',
                  value: analytics.staffCreated.length,
                  sub: 'new accounts',
                  color: 'text-purple-600',
                  spark: [],
                  sparkColor: '#a855f7',
                },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{kpi.label}</p>
                  <div className="flex items-end justify-between">
                    <p className={`text-3xl font-black ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                    {kpi.spark.length > 1 && <Sparkline values={kpi.spark} color={kpi.sparkColor} />}
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Daily volume bar */}
              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Daily Activity Volume</p>
                    <p className="text-xs text-slate-400 mt-0.5">Last 14 days</p>
                  </div>
                  <span className="text-slate-300"><Icon.TrendUp /></span>
                </div>
                <MiniBarChart data={analytics.dailyVolume} color="#3b82f6" />
              </div>

              {/* Type donut */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <p className="text-sm font-bold text-slate-900 mb-1">Event Breakdown</p>
                <p className="text-xs text-slate-400 mb-4">By transaction type</p>
                <div className="flex items-center gap-4">
                  <DonutChart segments={[
                    { label: 'Dispense', value: analytics.dispenses.length, color: '#3b82f6' },
                    { label: 'Sale', value: analytics.sales.length, color: '#10b981' },
                    { label: 'Staff', value: analytics.staffCreated.length, color: '#a855f7' },
                  ]} />
                  <div className="space-y-2 flex-1">
                    {[
                      { label: 'Dispense', count: analytics.dispenses.length, color: 'bg-blue-500' },
                      { label: 'Sale', count: analytics.sales.length, color: 'bg-emerald-500' },
                      { label: 'Staff', count: analytics.staffCreated.length, color: 'bg-purple-500' },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${s.color} shrink-0`} />
                        <span className="text-xs text-slate-500 flex-1">{s.label}</span>
                        <span className="text-xs font-bold text-slate-800">{s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Staff comparison + Top meds */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Staff comparison bar chart */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Staff Comparison</p>
                    <p className="text-xs text-slate-400 mt-0.5">Activity volume per staff member</p>
                  </div>
                  <span className="text-slate-300"><Icon.User /></span>
                </div>
                <StaffComparisonChart staffStats={analytics.staffStats} />
              </div>

              {/* Top medicines */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Recent Activities</p>
                    <p className="text-xs text-slate-400 mt-0.5">Latest staff actions</p>
                  </div>
                  <span className="text-slate-300"><Icon.Clock /></span>
                </div>
                {filteredLogs.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No activities yet</p>
                ) : (
                  <div className="space-y-3">
                    {filteredLogs.slice(0, 5).map((log, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-blue-400 mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{log.action}</p>
                          <p className="text-slate-400 text-[10px]">{new Date(log.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>


            {/* Staff breakdown table */}
            {Object.keys(analytics.staffStats).length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <p className="text-sm font-bold text-slate-900">Staff Activity Summary</p>
                  <p className="text-xs text-slate-400 mt-0.5">Breakdown per staff member</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {['Staff Member', 'Dispenses', 'Sales', 'Adjustments', 'Total', 'Share'].map(h => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(analytics.staffStats)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([uid, s]) => {
                          const pct = Math.round((s.total / (filteredLogs.length || 1)) * 100);
                          return (
                            <tr key={uid} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-black shrink-0">
                                    {s.name[0]?.toUpperCase()}
                                  </div>
                                  <span className="text-sm font-medium text-slate-800 truncate shrink-0">{s.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 font-semibold text-blue-600">{s.dispense}</td>
                              <td className="px-5 py-3 font-semibold text-emerald-600">{s.sale}</td>
                              <td className="px-5 py-3 font-semibold text-amber-600">{s.adjustment}</td>
                              <td className="px-5 py-3 font-black text-slate-900">{s.total}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden w-20">
                                    <div className="h-full bg-slate-400 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 font-semibold w-8 shrink-0">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* LOGS TAB                                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Timestamp', 'Type', 'Staff', 'Action', 'Details', ''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLogs.map((log, i) => {
                      const staffName = log.staffName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
                      const isSessionEnded = log.type === 'session_ended';
                      
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-5 py-3.5 whitespace-nowrap w-[13%]">
                            <p className="text-sm font-semibold text-slate-900">{new Date(log.timestamp).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </td>
                          <td className="px-5 py-3.5 w-[14%]">
                            {typeBadge(log.type)}
                          </td>
                          <td className="px-5 py-3.5 w-[20%]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                                <Icon.User />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 truncate">{staffName}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 w-[28%]">
                            <p className="text-sm text-slate-800 truncate">{log.action}</p>
                          </td>
                          <td className="px-5 py-3.5 w-[15%]">
                            <p className="text-xs text-slate-500 truncate">{JSON.stringify(log.details || {}).substring(0, 50)}...</p>
                          </td>
                          <td className="px-5 py-3.5 w-[10%] text-right">
                            {isSessionEnded && log.details && (
                              <button
                                onClick={() => {
                                  if (log.details) {
                                    setSelectedSessionData({
                                      details: log.details,
                                      staffName: staffName,
                                      sessionEndTime: log.timestamp,
                                    });
                                    setSessionModalOpen(true);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg border border-purple-200 transition-all whitespace-nowrap"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                                View
                              </button>
                            )}
                            {log.type === 'medicine_added' && log.details && (
                              <button
                                onClick={() => {
                                  setSelectedLogDetails({
                                    action: log.action,
                                    details: log.details,
                                    staffName: staffName,
                                    timestamp: log.timestamp,
                                    type: log.type,
                                  });
                                  setDetailsModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg border border-green-200 transition-all whitespace-nowrap"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                </svg>
                                View
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-3">
              {filteredLogs.map((log, i) => {
                const staffName = log.staffName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
                const isSessionEnded = log.type === 'session_ended';
                
                return (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400"><Icon.User /></div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{staffName}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-slate-800">{new Date(log.timestamp).toLocaleDateString()}</p>
                        <p className="text-[10px] text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {typeBadge(log.type)}
                    </div>
                    <div className="text-sm text-slate-700 pt-1 border-t border-slate-50">
                      <p className="font-semibold">{log.action}</p>
                      {log.details && Object.keys(log.details).length > 0 && (
                        <p className="text-xs text-slate-500 mt-1">{JSON.stringify(log.details).substring(0, 80)}...</p>
                      )}
                    </div>
                    {isSessionEnded && log.details && (
                      <button
                        onClick={() => {
                          if (log.details) {
                            setSelectedSessionData({
                              details: log.details,
                              staffName: staffName,
                              sessionEndTime: log.timestamp,
                            });
                            setSessionModalOpen(true);
                          }
                        }}
                        className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold rounded-lg border border-purple-200 transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                        View Session Summary
                      </button>
                    )}
                    {log.type === 'medicine_added' && log.details && (
                      <button
                        onClick={() => {
                          setSelectedLogDetails({
                            action: log.action,
                            details: log.details,
                            staffName: staffName,
                            timestamp: log.timestamp,
                            type: log.type,
                          });
                          setDetailsModalOpen(true);
                        }}
                        className="w-full py-2 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-semibold rounded-lg border border-green-200 transition-all flex items-center justify-center gap-1.5"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                        </svg>
                        View Details
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {filteredLogs.length === 0 && (
              <div className="bg-white rounded-2xl py-16 text-center border border-slate-200 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 mx-auto mb-4">
                  <Icon.Activity />
                </div>
                <p className="text-slate-500 font-medium">No activity logs found</p>
                <p className="text-sm text-slate-400 mt-1">Try adjusting your filters</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Admin Session Summary Modal */}
      {selectedSessionData && (
        <AdminSessionSummaryModal
          isOpen={sessionModalOpen}
          onClose={() => {
            setSessionModalOpen(false);
            setSelectedSessionData(null);
          }}
          sessionData={selectedSessionData.details}
          staffName={selectedSessionData.staffName}
          sessionEndTime={selectedSessionData.sessionEndTime}
        />
      )}

      {/* Details Modal */}
      <DetailsModal
        isOpen={detailsModalOpen}
        onClose={() => {
          setDetailsModalOpen(false);
          setSelectedLogDetails(null);
        }}
        log={selectedLogDetails}
      />
    </div>
  );
}

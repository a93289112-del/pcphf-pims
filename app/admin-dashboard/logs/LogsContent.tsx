'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { database } from '@/lib/services/firebase';
import { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { subscribeToActivityLogs, type ActivityLog, type ActivityType, type ActivityLogDetails } from '@/lib/services/activity-logs';
import StockAdjustmentSummaryModal from '@/lib/components/stock-adjustment-summary-modal';

// ── All activity types shown in logs (used by both the page and the dashboard card) ──
export const AUDITABLE_TYPES: ActivityType[] = [
  'admin_login',
  'admin_logout',
  'staff_login',
  'staff_logout',
  'medicine_added',
  'stock_deducted',
  'stock_adjusted',
  'medicine_sold',
  'medicine_dispensed',
  'medicine_restocked',
  'staff_created',
  'staff_disabled',
  'staff_enabled',
  'staff_deleted',
  'password_changed',
];

// ── Transaction activity types (excludes login/logout and staff management for logs page) ──
export const TRANSACTION_TYPES: ActivityType[] = [
  'medicine_added',
  'stock_adjusted',
  'medicine_sold',
  'medicine_dispensed',
];

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

// ── Mini bar chart with hover tooltip ────────────────────────────────────
function MiniBarChart({
  data,
  color = '#3b82f6',
  dates,
  staffNames,
  activityBreakdown = [],
}: {
  data: { label: string; value: number }[];
  color?: string;
  dates?: string[];
  staffNames?: string[];
  activityBreakdown?: { activityType: string; staff: string[] }[][];
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="relative w-full py-4">
      <div className="flex items-end justify-between gap-2 h-20 px-2">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex flex-col items-center gap-2 flex-1 min-w-0 group relative"
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div
              className="w-full rounded-sm transition-all duration-200 hover:opacity-100 cursor-pointer"
              style={{
                height: `${(d.value / max) * 64}px`,
                backgroundColor: color,
                opacity: hoveredIndex === i ? 1 : d.value === 0 ? 0.15 : 0.85,
              }}
            />
            <span className="text-[9px] text-slate-400 font-medium truncate w-full text-center">{d.label}</span>

            {hoveredIndex === i && (
              <div
                className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white font-semibold rounded-lg z-10 pointer-events-none shadow-lg overflow-hidden"
                style={{ maxWidth: 'calc(100vw - 32px)', width: 'max-content' }}
              >
                <div className="flex flex-col gap-1.5 px-3 py-3">
                  {dates && dates[i] && (
                    <div className="text-[8px] font-normal text-slate-400">
                      {new Date(dates[i]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                  <div className="text-[9px] text-white font-semibold">
                    {d.value} event{d.value !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
              </div>
            )}
          </div>
        ))}
      </div>
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

// ── Donut chart ─────────────────────────────────────────────────────────────
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;
  const r = 36, cx = 44, cy = 44, stroke = 14;
  const circ = 2 * Math.PI * r;

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
    { key: 'dispense' as const, color: '#3b82f6', label: 'Dispense' },
    { key: 'sale' as const, color: '#10b981', label: 'Sale' },
    { key: 'adjustment' as const, color: '#f59e0b', label: 'Adjust' },
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
                  <div
                    key={seg.key}
                    title={`${seg.label}: ${s[seg.key]}`}
                    className="h-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: seg.color }}
                  />
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

// ── Type badge helper ──────────────────────────────────────────────────────
const typeBadge = (type: string, action?: string) => {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    medicine_dispensed: { cls: 'bg-blue-50 text-blue-700 border border-blue-100', icon: <Icon.Dispense />, label: 'Dispensed' },
    medicine_sold: { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-100', icon: <Icon.Sale />, label: 'Sold' },
    medicine_added: { cls: 'bg-green-50 text-green-700 border border-green-100', icon: <Icon.Pill />, label: 'Medicine Added' },
    stock_deducted: { cls: 'bg-amber-50 text-amber-700 border border-amber-100', icon: <Icon.Adjustment />, label: 'Dispensing' },
    stock_adjusted: { cls: 'bg-orange-50 text-orange-700 border border-orange-100', icon: <Icon.Adjustment />, label: 'Stock Adjustment' },
    staff_created: { cls: 'bg-purple-50 text-purple-700 border border-purple-100', icon: <Icon.User />, label: 'Staff Created' },
    staff_disabled: { cls: 'bg-red-50 text-red-700 border border-red-100', icon: <Icon.User />, label: 'Staff Disabled' },
    staff_enabled: { cls: 'bg-green-50 text-green-700 border border-green-100', icon: <Icon.User />, label: 'Staff Enabled' },
    staff_deleted: { cls: 'bg-red-100 text-red-800 border border-red-200', icon: <Icon.User />, label: 'Staff Deleted' },
    password_changed: { cls: 'bg-rose-50 text-rose-700 border border-rose-100', icon: <Icon.Alert />, label: 'Password Changed' },
  };
  let cfg = map[type] || { cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: null, label: type };

  if (type === 'stock_adjusted' && action) {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('expiration') || actionLower.includes('date')) {
      cfg = { ...cfg, label: 'Adjusted Expiration' };
    } else if (actionLower.includes('price') || actionLower.includes('cost')) {
      cfg = { ...cfg, label: 'Adjusted Price' };
    } else if (actionLower.includes('stock') || actionLower.includes('quantity') || actionLower.includes('sachets')) {
      cfg = { ...cfg, label: 'Adjusted Stock' };
    }
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
};

// ── Details Modal ──────────────────────────────────────────────────────────
function DetailsModal({ isOpen, onClose, log, staffLastLogin = {} }: {
  isOpen: boolean;
  onClose: () => void;
  log: {
    action: string;
    details: ActivityLogDetails | undefined;
    staffName: string;
    staffId?: string;
    staffEmail?: string;
    timestamp: string;
    type: string;
    _grouped?: ActivityLog[];
  } | null;
  staffLastLogin?: Record<string, { timestamp: string; name: string; email: string }>;
}) {
  if (!isOpen || !log) return null;

  const initials = log.staffName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const HIDDEN_FIELDS = new Set(['medicineId', 'patientId', 'dispensId', 'saleId']);

  const renderDetailCards = () => {
    if (log._grouped && log._grouped.length > 0) {
      return log._grouped.map((g, idx) => {
        const qty = typeof g.details?.quantity === 'number' ? g.details.quantity : null;
        const unit = g.details?.unitType || '';
        const name = g.details?.medicineName || g.action;
        const patient = g.details?.patientName || '';
        const visibleEntries = Object.entries(g.details || {}).filter(
          ([k]) => !HIDDEN_FIELDS.has(k) && k !== 'medicineName' && k !== 'quantity' && k !== 'unitType' && k !== 'patientName'
        );

        return (
          <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Medicine {idx + 1}</span>
              {qty !== null && (
                <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {qty} {unit}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-900 mb-2">{name}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {patient && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Patient</p>
                  <p className="text-xs font-medium text-slate-800">{patient}</p>
                </div>
              )}
              {visibleEntries.map(([key, value]) => (
                <div key={key}>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{key}</p>
                  <p className="text-xs font-medium text-slate-800 break-words">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        );
      });
    }

    if (log.details && Object.keys(log.details).length > 0) {
      const qty = typeof log.details.quantity === 'number' ? log.details.quantity : null;
      const unit = log.details.unitType || '';
      const name = log.details.medicineName || '';
      const patient = log.details.patientName || '';
      const visibleEntries = Object.entries(log.details).filter(
        ([k]) => !HIDDEN_FIELDS.has(k) && k !== 'medicineName' && k !== 'quantity' && k !== 'unitType' && k !== 'patientName'
      );

      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          {name && <p className="text-sm font-bold text-slate-900 mb-2">{name}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {qty !== null && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Quantity</p>
                <p className="text-xs font-medium text-slate-800">{qty} {unit}</p>
              </div>
            )}
            {patient && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Patient</p>
                <p className="text-xs font-medium text-slate-800">{patient}</p>
              </div>
            )}
            {visibleEntries.map(([key, value]) => (
              <div key={key}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{key}</p>
                <p className="text-xs font-medium text-slate-800 break-words">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return <p className="text-sm text-slate-400 text-center py-4">No additional details available</p>;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', background: 'rgba(15,23,42,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ animation: 'modalPop 0.25s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.9) translateY(12px); }
            to   { opacity: 1; transform: scale(1)   translateY(0);    }
          }
        `}</style>

        {/* Header */}
        <div className="bg-blue-600 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">{log.staffName}</p>
              {log.staffEmail && <p className="text-[10px] text-blue-200">{log.staffEmail}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {typeBadge(log.type, log.action)}
            <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Meta bar */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            {new Date(log.timestamp).toLocaleString('en-US', {
              timeZone: 'Asia/Manila',
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })}
          </div>
          {(log.details?.patientName || log._grouped?.[0]?.details?.patientName) && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
              <span className="font-medium text-slate-700">
                {log.details?.patientName || log._grouped?.[0]?.details?.patientName}
              </span>
            </div>
          )}
          {log._grouped && (
            <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              {log._grouped.length} medicines
            </span>
          )}
        </div>

        {/* Medicine cards */}
        <div className="p-3 flex flex-col gap-2 overflow-y-auto max-h-80">
          {renderDetailCards()}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function LogsContent() {
  const { user } = useAuth();

  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [staffUsers, setStaffUsers] = useState<{ uid: string; staffName?: string; email?: string; role?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | ActivityType>('all');
  const [selectedStaff, setSelectedStaff] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'staff'>('all');
  const [filterDate, setFilterDate] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'logs'>('logs');
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLogDetails, setSelectedLogDetails] = useState<{
    action: string;
    details: ActivityLogDetails | undefined;
    staffName: string;
    staffId?: string;
    staffEmail?: string;
    timestamp: string;
    type: string;
    _grouped?: ActivityLog[];
  } | null>(null);
  const [adjustmentModalOpen, setAdjustmentModalOpen] = useState(false);
  const [selectedAdjustmentData, setSelectedAdjustmentData] = useState<{
    details: ActivityLogDetails;
    staffName: string;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToActivityLogs((logs) => {
      setActivityLogs(logs);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const usersRef = ref(database, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setStaffUsers([]); return; }
      const users = Object.entries(data).map(([uid, value]) => ({
        uid,
        ...(value as { staffName?: string; email?: string; role?: string }),
      })) as { uid: string; staffName?: string; email?: string; role?: string }[];
      setStaffUsers(users.filter(u => u.role === 'staff'));
    });
    return () => unsubscribe();
  }, [user]);

  // ── Filtered logs ──────────────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    return activityLogs.filter(log => {
      if (!TRANSACTION_TYPES.includes(log.type)) return false;
      const matchesType = typeFilter === 'all' || log.type === typeFilter;
      const matchesStaff = selectedStaff === 'all' || log.staffId === selectedStaff;
      const matchesRole = roleFilter === 'all' || log.userRole === roleFilter;
      let matchesDate = true;
      if (filterDate) {
        const logDate = new Date(log.timestamp).toISOString().slice(0, 10);
        matchesDate = logDate === filterDate;
      }
      return matchesType && matchesStaff && matchesRole && matchesDate;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activityLogs, typeFilter, selectedStaff, roleFilter, filterDate]);

  // ── Group consecutive dispensed/sold transactions ──────────────────────
  const groupedLogs = useMemo(() => {
    const result: (ActivityLog & { _grouped?: ActivityLog[] })[] = [];
    const grouped = new Set<number>();

    filteredLogs.forEach((log, idx) => {
      if (grouped.has(idx)) return;

      const isDispense = log.type === 'medicine_dispensed';
      const isSale = log.type === 'medicine_sold';

      const shouldGroup =
        (isDispense && typeFilter !== 'medicine_sold' && typeFilter !== 'medicine_added' && typeFilter !== 'stock_adjusted') ||
        (isSale && typeFilter !== 'medicine_dispensed' && typeFilter !== 'medicine_added' && typeFilter !== 'stock_adjusted');

      if (shouldGroup) {
        const group: ActivityLog[] = [log];
        const logTime = new Date(log.timestamp).getTime();

        for (let i = idx + 1; i < filteredLogs.length; i++) {
          if (grouped.has(i)) break;
          const nextLog = filteredLogs[i];
          if (nextLog.type !== log.type) break;
          if (nextLog.staffId !== log.staffId) break;

          const nextTime = new Date(nextLog.timestamp).getTime();
          if (nextTime - logTime > 30000) break;

          group.push(nextLog);
          grouped.add(i);
        }

        if (group.length > 1) {
          if (isDispense) {
            const patientMatch = group[0].action.match(/to patient\s+(.+?)(?:\s|$)/i);
            const patient = patientMatch ? patientMatch[1] : 'patient';
            result.push({
              ...log,
              action: `Dispensed ${group.length} medicines to ${patient}`,
              _grouped: group,
            });
          } else {
            // Sale: summarize the whole transaction into one row
            const names = group
              .map(g => g.details?.medicineName || g.action.replace(/^Sold \d+ \S+ of /, ''))
              .filter(Boolean);
            const preview =
              names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '');
            const totalUnits = group.reduce(
              (sum, g) => sum + (typeof g.details?.quantity === 'number' ? g.details.quantity : 0),
              0,
            );
            result.push({
              ...log,
              action: `Sold ${group.length} medicines (${totalUnits} units total) — ${preview}`,
              _grouped: group,
            });
          }
        } else {
          result.push(log);
        }
      } else {
        result.push(log);
      }
    });

    return result; // ← closes groupedLogs correctly
  }, [filteredLogs, typeFilter]);

  // ── Analytics ──────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    let totalDispensedUnits = 0;
    let totalSoldUnits = 0;

    const dispenseLogs = filteredLogs.filter(l => l.type === 'medicine_dispensed');
    const saleLogs = filteredLogs.filter(l => l.type === 'medicine_sold');

    dispenseLogs.forEach(log => {
      totalDispensedUnits += Math.abs(typeof log.details?.quantity === 'number' ? log.details.quantity : 0);
    });
    saleLogs.forEach(log => {
      totalSoldUnits += Math.abs(typeof log.details?.quantity === 'number' ? log.details.quantity : 0);
    });

    // Track staff last login
    const staffLastLogin: Record<string, { timestamp: string; name: string; email: string }> = {};
    activityLogs
      .filter(l => l.type === 'staff_login')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .forEach(log => {
        const uid = log.staffId || 'system';
        if (!staffLastLogin[uid]) {
          staffLastLogin[uid] = {
            timestamp: log.timestamp,
            name: log.staffName || log.staffEmail?.split('@')[0] || uid,
            email: log.staffEmail || '',
          };
        }
      });

    // Build activity stats
    const activityStats: Record<string, {
      dispense: number; sale: number; adjustment: number; total: number; email: string; name: string;
    }> = {};

    const staffLookup = new Map<string, { name: string; email: string }>();
    staffUsers.forEach(s => {
      staffLookup.set(s.uid, {
        name: s.staffName || s.email?.split('@')[0] || s.uid,
        email: s.email || '',
      });
    });

    const includeAdmins = roleFilter === 'all' || roleFilter === 'admin';
    const includeStaff = roleFilter === 'all' || roleFilter === 'staff';

    filteredLogs.forEach(l => {
      const isAdmin = l.userRole === 'admin';
      const isStaffActivity = !isAdmin;
      if (isAdmin && !includeAdmins) return;
      if (isStaffActivity && !includeStaff) return;
      if (user && (l.staffId === user.uid || l.staffEmail === user.email)) return;

      if (TRANSACTION_TYPES.includes(l.type)) {
        const uid = l.staffId || 'system';
        let displayName = l.staffName || l.staffEmail || uid;
        let displayEmail = l.staffEmail || '';
        if (staffLookup.has(uid)) {
          const staffInfo = staffLookup.get(uid)!;
          displayName = staffInfo.name;
          displayEmail = staffInfo.email;
        }
        if (!activityStats[uid]) {
          activityStats[uid] = { dispense: 0, sale: 0, adjustment: 0, total: 0, email: displayEmail, name: displayName };
        }
        if (l.type === 'medicine_dispensed') activityStats[uid].dispense++;
        else if (l.type === 'medicine_sold') activityStats[uid].sale++;
        else if (l.type === 'stock_adjusted' || l.type === 'medicine_added') activityStats[uid].adjustment++;
        activityStats[uid].total++;
      }
    });

    const staffStats = Object.fromEntries(
      Object.entries(activityStats).filter(([, stats]) => stats.total > 0)
    );

    const last14 = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i));
      return d.toISOString().slice(0, 10);
    });

    const dailyVolume = last14.map(day => ({
      label: new Date(day).toLocaleDateString('en', { weekday: 'short' }).slice(0, 1),
      value: filteredLogs.filter(l => l.timestamp?.slice(0, 10) === day && TRANSACTION_TYPES.includes(l.type)).length,
    }));

    const dailyActivityBreakdown = last14.map(day => {
      const dayLogs = filteredLogs.filter(l => l.timestamp?.slice(0, 10) === day && TRANSACTION_TYPES.includes(l.type));
      if (dayLogs.length === 0) return [];
      const activityMap = new Map<string, Set<string>>();
      dayLogs.forEach(log => {
        if (!activityMap.has(log.type)) activityMap.set(log.type, new Set<string>());
        const staffName = log.staffName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
        const cleanName = staffName.includes('@') ? staffName.split('@')[0] : staffName;
        activityMap.get(log.type)!.add(cleanName);
      });
      return Array.from(activityMap.entries()).map(([type, staffSet]) => ({
        activityType: type,
        staff: Array.from(staffSet),
      }));
    });

    const dailyStaffNames = last14.map(day => {
      const dayLogs = filteredLogs.filter(l => l.timestamp?.slice(0, 10) === day);
      if (dayLogs.length === 0) return '';
      const staffSet = new Set<string>();
      dayLogs.forEach(log => {
        const name = log.staffName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
        staffSet.add(name.includes('@') ? name.split('@')[0] : name);
      });
      const staffArray = Array.from(staffSet);
      if (staffArray.length === 1) return staffArray[0];
      if (staffArray.length <= 3) return staffArray.join(', ');
      return staffArray.slice(0, 2).join(', ') + ` +${staffArray.length - 2}`;
    });

    const spark = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return filteredLogs.filter(l => l.timestamp?.slice(0, 10) === d.toISOString().slice(0, 10)).length;
    });

    return {
      dispenses: dispenseLogs,
      sales: saleLogs,
      staffStats,
      dailyVolume,
      dailyVolumeDates: last14,
      dailyStaffNames,
      dailyActivityBreakdown,
      spark,
      totalDispensedUnits,
      totalSoldUnits,
      staffLastLogin,
    };
  }, [filteredLogs, activityLogs, user, staffUsers, roleFilter]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading activity logs…</p>
      </div>
    </div>
  );

  const hasFilters = typeFilter !== 'all' || selectedStaff !== 'all' || roleFilter !== 'all' || filterDate;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f8f8f7] w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">System Activity Logs</h1>
          <p className="text-slate-500">Full audit trail of all inventory and sales transactions</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-white border border-slate-200 rounded-xl p-1 w-fit shadow-sm">
          {(['overview', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${activeTab === tab ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {tab === 'overview' ? 'Overview & Charts' : 'Activity Logs'}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 text-slate-400">
            <Icon.Filter />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Filters</span>
            {hasFilters && (
              <button
                onClick={() => { setTypeFilter('all'); setSelectedStaff('all'); setRoleFilter('all'); setFilterDate(''); }}
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
                onChange={e => setSelectedStaff(e.target.value)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Staff</option>
                {staffUsers
                  .sort((a, b) => (a.staffName || a.email || '').localeCompare(b.staffName || b.email || ''))
                  .map(s => (
                    <option key={s.uid} value={s.uid}>{s.staffName || s.email?.split('@')[0] || s.uid}</option>
                  ))}
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.User /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Role */}
            <div className="relative">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as 'all' | 'admin' | 'staff')}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admin Only</option>
                <option value="staff">Staff Only</option>
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.User /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Type */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as 'all' | ActivityType)}
                className="appearance-none pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              >
                <option value="all">All Types</option>
                <option value="medicine_added">Medicine Added</option>
                <option value="stock_adjusted">Stock Adjustment</option>
                <option value="medicine_sold">Sales</option>
                <option value="medicine_dispensed">Dispensed</option>
              </select>
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.Activity /></span>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.ChevronDown /></span>
            </div>

            {/* Date */}
            <div className="relative">
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="pl-8 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all cursor-pointer"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"><Icon.Calendar /></span>
            </div>

            <span className="ml-auto text-xs text-slate-400 font-medium">{filteredLogs.length} events</span>
          </div>
        </div>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { label: 'Total Events', value: filteredLogs.length, sub: 'in selected period', color: 'text-slate-900', spark: analytics.spark, sparkColor: '#64748b' },
                { label: 'Dispenses', value: analytics.totalDispensedUnits, sub: 'total units dispensed', color: 'text-blue-600', spark: analytics.spark, sparkColor: '#3b82f6' },
                { label: 'POS Sales', value: analytics.totalSoldUnits, sub: 'total units sold', color: 'text-emerald-600', spark: analytics.spark, sparkColor: '#10b981' },
              ].map(kpi => (
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

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Daily Activity Volume</p>
                    <p className="text-xs text-slate-400 mt-0.5">Last 14 days</p>
                  </div>
                  <span className="text-slate-300"><Icon.TrendUp /></span>
                </div>
                <div className="pt-8 pb-2">
                  <MiniBarChart
                    data={analytics.dailyVolume}
                    color="#3b82f6"
                    dates={analytics.dailyVolumeDates}
                    activityBreakdown={analytics.dailyActivityBreakdown}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Staff & Admin Activity</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {roleFilter === 'admin' ? 'Admin actions' : roleFilter === 'staff' ? 'Staff member actions' : 'All activity'}
                    </p>
                  </div>
                  <span className="text-slate-300"><Icon.User /></span>
                </div>
                {Object.keys(analytics.staffStats).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">
                    {roleFilter === 'admin' ? 'No admin activities recorded' : 'No staff activities recorded'}
                  </p>
                ) : (
                  <StaffComparisonChart staffStats={analytics.staffStats} />
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Recent Activities</p>
                    <p className="text-xs text-slate-400 mt-0.5">Latest staff actions</p>
                  </div>
                  <span className="text-slate-300"><Icon.Clock /></span>
                </div>
                {groupedLogs.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No activities yet</p>
                ) : (
                  <div className="space-y-3">
                    {groupedLogs.slice(0, 5).map((log, i) => {
                      const rawName = log.staffName || '';
                      const staffName = rawName.includes('@') ? rawName.split('@')[0] : rawName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <div className="w-2 h-2 rounded-full bg-blue-400 mt-1 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{log.action}</p>
                            <p className="text-slate-400 text-[10px]">
                              by {staffName} • {new Date(log.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── LOGS TAB ── */}
        {activeTab === 'logs' && (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block bg-white rounded-2xl shadow-sm border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[50%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-t border-b border-slate-200 rounded-t-lg">
                      {['Staff', 'Action', ''].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider first:rounded-tl-lg last:rounded-tr-lg">{h}</th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                <table className="w-full text-sm border-collapse">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[50%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <tbody className="divide-y divide-slate-100">
                    {groupedLogs.map((log, i) => {
                      const rawName = log.staffName || '';
                      const staffName = rawName.includes('@') ? rawName.split('@')[0] : rawName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-5 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 text-sm font-bold">
                                {staffName[0]?.toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{staffName}</p>
                                <p className="text-xs text-slate-400">
                                  {new Date(log.timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="space-y-1">
                              <p className="text-sm text-slate-800 line-clamp-2">{log.action}</p>
                              <div className="flex gap-1 items-center flex-wrap">
                                {typeBadge(log.type, log.action)}
                                <span className="text-xs text-slate-500 italic">by {staffName}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedLogDetails({
                                  action: log.action,
                                  details: log.details,
                                  staffName,
                                  staffId: log.staffId,
                                  staffEmail: log.staffEmail,
                                  timestamp: log.timestamp,
                                  type: log.type,
                                  _grouped: (log as any)._grouped,
                                });
                                setDetailsModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-all whitespace-nowrap"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                              </svg>
                              View
                            </button>
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
              {groupedLogs.map((log, i) => {
                const rawName = log.staffName || '';
                const staffName = rawName.includes('@') ? rawName.split('@')[0] : rawName || log.staffEmail?.split('@')[0] || log.staffId || 'System';
                return (
                  <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 text-sm font-bold">
                          {staffName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{staffName}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(log.timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {typeBadge(log.type, log.action)}
                      <span className="text-xs text-slate-500 italic">by {staffName}</span>
                    </div>
                    <div className="text-sm text-slate-700 pt-1 border-t border-slate-50">
                      <p className="font-semibold line-clamp-2">{log.action}</p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedLogDetails({
                          action: log.action,
                          details: log.details,
                          staffName,
                          staffId: log.staffId,
                          staffEmail: log.staffEmail,
                          timestamp: log.timestamp,
                          type: log.type,
                          _grouped: (log as any)._grouped,
                        });
                        setDetailsModalOpen(true);
                      }}
                      className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-all flex items-center justify-center gap-1.5"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                      </svg>
                      View Details
                    </button>
                  </div>
                );
              })}
            </div>

            {groupedLogs.length === 0 && (
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

      <DetailsModal
        isOpen={detailsModalOpen}
        onClose={() => { setDetailsModalOpen(false); setSelectedLogDetails(null); }}
        log={selectedLogDetails}
        staffLastLogin={analytics.staffLastLogin}
      />

      {selectedAdjustmentData && (
        <StockAdjustmentSummaryModal
          isOpen={adjustmentModalOpen}
          onClose={() => { setAdjustmentModalOpen(false); setSelectedAdjustmentData(null); }}
          adjustmentData={selectedAdjustmentData.details}
          staffName={selectedAdjustmentData.staffName}
          timestamp={selectedAdjustmentData.timestamp}
        />
      )}
    </div>
  );
}
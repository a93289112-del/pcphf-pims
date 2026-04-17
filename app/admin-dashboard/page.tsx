'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useEffect, useState, useMemo } from 'react';
import { database } from '@/lib/services/firebase';
import { ref, onValue } from 'firebase/database';
import Link from 'next/link';
import { type Medicine, type FirebaseTransaction } from '@/lib/types';
import { subscribeToActivityLogs, type ActivityLog } from '@/lib/services/activity-logs';

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'staff';
  status: 'pending' | 'approved' | 'disabled';
  createdAt: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();

  const [users,        setUsers]        = useState<UserProfile[]>([]);
  const [transactions, setTransactions] = useState<FirebaseTransaction[]>([]);
  const [medicines,    setMedicines]    = useState<Medicine[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loadingStates, setLoadingStates] = useState({
    users: true,
    medicines: true,
    transactions: true,
    activityLogs: true,
  });

  const isLoading =
    loadingStates.users ||
    loadingStates.medicines ||
    loadingStates.transactions ||
    loadingStates.activityLogs;

  // ── Data listeners ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const timeout = setTimeout(() => {
      setLoadingStates({ users: false, medicines: false, transactions: false, activityLogs: false });
    }, 10000);

    // Users
    const unsubUsers = onValue(
      ref(database, 'users'),
      (snap) => {
        const data = snap.val();
        setUsers(data ? (Object.values(data) as UserProfile[]) : []);
        setLoadingStates((p) => ({ ...p, users: false }));
      },
      (err) => {
        console.error('Users read error:', err);
        setLoadingStates((p) => ({ ...p, users: false }));
      },
    );

    // All medicines and transactions are now globally shared
    const unsubMedicines = onValue(
      ref(database, 'medicines'),
      (snapshot) => {
        const data = snapshot.val();
        const meds: Medicine[] = data
          ? Object.entries(data as Record<string, Omit<Medicine, 'id'>>).map(([id, med]) => ({ id, ...med } as Medicine))
          : [];
        setMedicines(meds);
        setLoadingStates((p) => ({ ...p, medicines: false }));
      },
      (err) => {
        console.error('Medicines read error:', err);
        setLoadingStates((p) => ({ ...p, medicines: false }));
      },
    );

    const unsubTransactions = onValue(
      ref(database, 'transactions'),
      (snapshot) => {
        const data = snapshot.val();
        const trans: FirebaseTransaction[] = data
          ? Object.values(data as Record<string, FirebaseTransaction>)
          : [];
        setTransactions(trans);
        setLoadingStates((p) => ({ ...p, transactions: false }));
      },
      (err) => {
        console.error('Transactions read error:', err);
        setLoadingStates((p) => ({ ...p, transactions: false }));
      },
    );

    // Activity logs (session events live here)
    const unsubLogs = subscribeToActivityLogs((logs) => {
      setActivityLogs(logs);
      setLoadingStates((p) => ({ ...p, activityLogs: false }));
    });

    return () => {
      clearTimeout(timeout);
      unsubUsers();
      unsubMedicines();
      unsubTransactions();
      unsubLogs();
    };
  }, [user]);

  // ── Session stats derived from activity logs ───────────────────────────────
  const sessionStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessionsEndedToday = activityLogs.filter(
      (l) => l.type === 'session_ended' && new Date(l.timestamp) >= today,
    );
    const sessionsStartedToday = activityLogs.filter(
      (l) => l.type === 'session_started' && new Date(l.timestamp) >= today,
    );

    // Total sessions ever (all time session_ended count = completed sessions)
    const totalSessionsAllTime = activityLogs.filter((l) => l.type === 'session_ended').length;

    // Active sessions right now: staff whose LAST session event today is session_started
    // (i.e. they started a session but haven't ended it yet)
    const staffSessionMap = new Map<string, string>(); // staffId → last event type today
    activityLogs
      .filter(
        (l) =>
          new Date(l.timestamp) >= today &&
          (l.type === 'session_ended' || l.type === 'session_started'),
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((l) => staffSessionMap.set(l.staffId, l.type));

    const activeSessionsNow = Array.from(staffSessionMap.values()).filter(
      (v) => v === 'session_started',
    ).length;

    // Average session duration (from completed sessions that have duration data)
    const durationsMinutes = activityLogs
      .filter((l) => l.type === 'session_ended' && l.details?.sessionDurationMinutes != null)
      .map((l) => Number(l.details!.sessionDurationMinutes));

    const avgDurationMinutes =
      durationsMinutes.length > 0
        ? Math.round(durationsMinutes.reduce((s, v) => s + v, 0) / durationsMinutes.length)
        : 0;

    const avgHours = Math.floor(avgDurationMinutes / 60);
    const avgMins  = avgDurationMinutes % 60;
    const avgLabel = avgDurationMinutes > 0
      ? avgHours > 0 ? `${avgHours}h ${avgMins}m` : `${avgMins}m`
      : '—';

    // Per-staff session breakdown (all time)
    const perStaff = new Map<string, { email: string; ended: number; started: number; totalMinutes: number }>();
    activityLogs
      .filter((l) => l.type === 'session_ended' || l.type === 'session_started')
      .forEach((l) => {
        if (!perStaff.has(l.staffId)) {
          perStaff.set(l.staffId, {
            email: l.staffEmail,
            ended: 0,
            started: 0,
            totalMinutes: 0,
          });
        }
        const entry = perStaff.get(l.staffId)!;
        if (l.type === 'session_ended') {
          entry.ended++;
          entry.totalMinutes += Number(l.details?.sessionDurationMinutes ?? 0);
        } else {
          entry.started++;
        }
      });

    return {
      endedToday:         sessionsEndedToday.length,
      startedToday:       sessionsStartedToday.length,
      activeNow:          activeSessionsNow,
      totalAllTime:       totalSessionsAllTime,
      avgLabel,
      perStaff: Array.from(perStaff.entries())
        .map(([uid, v]) => ({ uid, ...v }))
        .sort((a, b) => b.ended - a.ended),
    };
  }, [activityLogs]);

  // ── Staff activity (transactions) ──────────────────────────────────────────
  const staffActivity = useMemo(() => {
    const activity: Record<string, { count: number; recent: FirebaseTransaction[] }> = {};
    const validTx = transactions.filter((t) => t && t.date && t.userId);
    const sorted  = [...validTx].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const counted = new Set<string>();

    sorted.forEach((t) => {
      if (!t.userId) return;
      if (!activity[t.userId]) activity[t.userId] = { count: 0, recent: [] };

      if ((t.type === 'dispense' || t.type === 'sale') && t.referenceId) {
        const key = `${t.userId}-${t.referenceId}`;
        if (!counted.has(key)) {
          activity[t.userId].count++;
          counted.add(key);
        }
      } else {
        activity[t.userId].count++;
      }
      if (activity[t.userId].recent.length < 3) activity[t.userId].recent.push(t);
    });

    return Object.entries(activity)
      .map(([uid, data]) => ({
        uid,
        email: (Array.isArray(users) ? users : []).find((u) => u.uid === uid)?.email || uid,
        count: data.count,
        recent: data.recent,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [transactions, users]);

  // ── Derived counts ─────────────────────────────────────────────────────────
  const pendingApprovals = useMemo(() => users.filter((u) => u.status === 'pending').length, [users]);
  const totalStaffs      = useMemo(() => users.filter((u) => u.role === 'staff').length, [users]);
  const lowStockItems    = useMemo(() =>
    medicines.filter((m) => {
      const stock = (m.quantity ?? 0) * (m.stockPerUnit ?? 1);
      return stock <= (m.minStock ?? 10);
    }).length,
  [medicines]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen transition-all duration-300 bg-slate-50/70 w-full overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">Admin Dashboard</h1>
          <p className="text-slate-500">Staff management, approvals, and system activity</p>
        </div>

        {/* ── Row 1: Staff / Stock stats ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <StatCard
            title="Account Requests"
            value={pendingApprovals}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>}
            color="orange"
            link="/admin-dashboard/accounts?filter=pending"
          />
          <StatCard
            title="Active Staffs"
            value={totalStaffs}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v1H1v-1a9 9 0 0118 0z" /></svg>}
            color="blue"
            link="/admin-dashboard/accounts"
          />
          <StatCard
            title="Low Stock Items"
            value={lowStockItems}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4v2m0 5v1M7.08 6.47A9.969 9.969 0 0112 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-1.821.487-3.53 1.333-5M12 12h.01" /></svg>}
            color={lowStockItems > 0 ? 'orange' : 'emerald'}
          />
        </div>

        {/* ── Row 2: Session stats ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <StatCard
            title="Sessions Today"
            value={sessionStats.endedToday}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>}
            color="rose"
            sub="ended today"
          />
          <StatCard
            title="New Sessions Today"
            value={sessionStats.startedToday}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
            color="teal"
            sub="started today"
          />
          <StatCard
            title="Total Sessions"
            value={sessionStats.totalAllTime}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" /><rect x="3" y="3" width="18" height="18" rx="2" /></svg>}
            color="violet"
            sub="all time completed"
          />
          <StatCard
            title="Avg Session Length"
            value={sessionStats.avgLabel}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" /></svg>}
            color="blue"
            sub="per completed session"
          />
        </div>

        {/* ── Per-staff session breakdown panel ─────────────────────────── */}
        {sessionStats.perStaff.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Session Breakdown by Staff</h2>
                <p className="text-xs text-slate-500">Total completed sessions and average duration per staff member</p>
              </div>
              {/* Active now badge */}
              {sessionStats.activeNow > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-700">
                    {sessionStats.activeNow} active session{sessionStats.activeNow !== 1 ? 's' : ''} now
                  </span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff</th>
                    <th className="text-right py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sessions Completed</th>
                    <th className="text-right py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">New Sessions Started</th>
                    <th className="text-right py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Time Worked</th>
                    <th className="text-right py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg per Session</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionStats.perStaff.map((s) => {
                    const totalH   = Math.floor(s.totalMinutes / 60);
                    const totalM   = s.totalMinutes % 60;
                    const totalStr = s.totalMinutes > 0
                      ? totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`
                      : '—';
                    const avgM  = s.ended > 0 ? Math.round(s.totalMinutes / s.ended) : 0;
                    const avgH  = Math.floor(avgM / 60);
                    const avgMr = avgM % 60;
                    const avgStr = avgM > 0
                      ? avgH > 0 ? `${avgH}h ${avgMr}m` : `${avgMr}m`
                      : '—';

                    return (
                      <tr key={s.uid} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-sm shadow-blue-100">
                              {s.email[0].toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-800 text-xs truncate max-w-45">{s.email}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center justify-center min-w-8 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 font-black text-sm">
                            {s.ended}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="inline-flex items-center justify-center min-w-8 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-100 text-teal-700 font-black text-sm">
                            {s.started}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-700 text-xs">{totalStr}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-500 text-xs">{avgStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Staff Activity Monitor ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Staff Activity Monitor</h2>
              <p className="text-xs text-slate-500">Activity tracking and performance per staff member</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {staffActivity.map((staff) => (
              <div key={staff.uid} className="p-5 rounded-2xl bg-slate-50/50 border border-slate-100 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-blue-100">
                      {staff.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{staff.email}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{staff.count} Total Actions</p>
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-500">
                    RANK #{staffActivity.indexOf(staff) + 1}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Recent Activity</p>
                  {staff.recent.map((log, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm">
                      <div className={`w-2 h-2 rounded-full ${
                        log.type === 'adjustment' ? 'bg-orange-400' :
                        log.type === 'sale'       ? 'bg-emerald-400' : 'bg-blue-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-slate-700 capitalize leading-tight">
                          {log.type} recorded
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          Qty: {log.quantity} · {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {staff.recent.length === 0 && (
                    <p className="text-[10px] text-slate-400 italic py-2">No recent activity</p>
                  )}
                </div>
              </div>
            ))}
            {staffActivity.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-sm text-slate-400">No staff activity recorded</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────────
function StatCard({
  title, value, icon, color, link, sub,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  link?: string;
  sub?: string;
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50/50   text-blue-600   border-blue-100/50',
    orange: 'bg-orange-50/50 text-orange-600 border-orange-100/50',
    emerald:'bg-emerald-50/50 text-emerald-600 border-emerald-100/50',
    rose:   'bg-rose-50/50   text-rose-600   border-rose-100/50',
    teal:   'bg-teal-50/50   text-teal-600   border-teal-100/50',
    violet: 'bg-violet-50/50 text-violet-600 border-violet-100/50',
  };
  const iconColors: Record<string, string> = {
    blue:   'bg-blue-600   text-white',
    orange: 'bg-orange-500 text-white',
    emerald:'bg-emerald-500 text-white',
    rose:   'bg-rose-500   text-white',
    teal:   'bg-teal-500   text-white',
    violet: 'bg-violet-600 text-white',
  };

  const content = (
    <div className={`group p-6 rounded-2xl border ${colors[color] || 'bg-slate-50 text-slate-600'} bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}>
      <div className="flex items-start justify-between mb-4">
        <div className={`p-2.5 rounded-xl shadow-sm ${iconColors[color] || 'bg-slate-600 text-white'}`}>
          {icon}
        </div>
        {link && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-slate-900 mb-1">{value}</p>
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1 font-medium">{sub}</p>}
    </div>
  );

  if (link) return <Link href={link}>{content}</Link>;
  return content;
}
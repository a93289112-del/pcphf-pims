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
  staffName?: string;
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

  useEffect(() => {
    if (!user) return;

    const timeout = setTimeout(() => {
      setLoadingStates({ users: false, medicines: false, transactions: false, activityLogs: false });
    }, 10000);

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

  const getDisplayName = (uid: string, fallbackEmail?: string) => {
    const found = (Array.isArray(users) ? users : []).find((u) => u.uid === uid);
    return found?.staffName || fallbackEmail || uid;
  };

  const sessionStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sessionsEndedToday   = activityLogs.filter((l) => l.type === 'session_ended'   && new Date(l.timestamp) >= today);
    const sessionsStartedToday = activityLogs.filter((l) => l.type === 'session_started' && new Date(l.timestamp) >= today);
    const totalSessionsAllTime = activityLogs.filter((l) => l.type === 'session_ended').length;

    const staffSessionMap = new Map<string, string>();
    activityLogs
      .filter((l) => new Date(l.timestamp) >= today && (l.type === 'session_ended' || l.type === 'session_started'))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .forEach((l) => staffSessionMap.set(l.staffId, l.type));

    const activeSessionsNow = Array.from(staffSessionMap.values()).filter((v) => v === 'session_started').length;

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

    const perStaff = new Map<string, { email: string; ended: number; started: number; totalMinutes: number }>();
    activityLogs
      .filter((l) => l.type === 'session_ended' || l.type === 'session_started')
      .forEach((l) => {
        if (!perStaff.has(l.staffId)) perStaff.set(l.staffId, { email: l.staffEmail, ended: 0, started: 0, totalMinutes: 0 });
        const entry = perStaff.get(l.staffId)!;
        if (l.type === 'session_ended') { entry.ended++; entry.totalMinutes += Number(l.details?.sessionDurationMinutes ?? 0); }
        else entry.started++;
      });

    return {
      endedToday:   sessionsEndedToday.length,
      startedToday: sessionsStartedToday.length,
      activeNow:    activeSessionsNow,
      totalAllTime: totalSessionsAllTime,
      avgLabel,
      perStaff: Array.from(perStaff.entries()).map(([uid, v]) => ({ uid, ...v })).sort((a, b) => b.ended - a.ended),
    };
  }, [activityLogs]);

  const staffActivity = useMemo(() => {
    const activity: Record<string, { count: number; recent: FirebaseTransaction[] }> = {};
    const validTx  = transactions.filter((t) => t && t.date && t.userId);
    const sorted   = [...validTx].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const counted  = new Set<string>();

    sorted.forEach((t) => {
      if (!t.userId) return;
      if (!activity[t.userId]) activity[t.userId] = { count: 0, recent: [] };
      if ((t.type === 'dispense' || t.type === 'sale') && t.referenceId) {
        const key = `${t.userId}-${t.referenceId}`;
        if (!counted.has(key)) { activity[t.userId].count++; counted.add(key); }
      } else {
        activity[t.userId].count++;
      }
      if (activity[t.userId].recent.length < 3) activity[t.userId].recent.push(t);
    });

    return Object.entries(activity)
      .map(([uid, data]) => {
        const found = (Array.isArray(users) ? users : []).find((u) => u.uid === uid);
        return {
          uid,
          displayName: found?.staffName || found?.email || uid,
          email: found?.email || uid,
          count: data.count,
          recent: data.recent,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [transactions, users]);

  const totalStaffs   = useMemo(() => users.filter((u) => u.role === 'staff').length, [users]);
  const lowStockItems = useMemo(() =>
    medicines.filter((m) => {
      const stock = (m.quantity ?? 0) * (m.stockPerUnit ?? 1);
      return stock <= (m.minStock ?? 10);
    }).length,
  [medicines]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f8f7f4]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full border-4 border-slate-200" />
            <div className="absolute inset-0 rounded-full border-4 border-t-indigo-600 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-400 tracking-widest uppercase">Loading dashboard</p>
        </div>
      </div>
    );
  }

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? 'Good morning' :
    now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-[#f8f7f4] w-full">

      <div className="bg-white border-b border-slate-100 px-4 sm:px-8 py-8 mb-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-indigo-500 uppercase tracking-widest mb-1">{greeting}</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 leading-none">
              Admin Dashboard
            </h1>
            <p className="text-slate-400 text-sm mt-2">
              {now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          {sessionStats.activeNow > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-200 self-start sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm font-bold">
                {sessionStats.activeNow} session{sessionStats.activeNow !== 1 ? 's' : ''} active
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12 space-y-8">

        <Section label="Overview">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Staff"
              value={totalStaffs}
              icon={<PeopleIcon />}
              accent="indigo"
              link="/admin-dashboard/staff-list"
              sub="team members"
            />
            <StatCard
              title="Low Stock"
              value={lowStockItems}
              icon={<AlertIcon />}
              accent={lowStockItems > 0 ? 'amber' : 'emerald'}
              sub={lowStockItems > 0 ? 'need restocking' : 'all stocked up'}
            />
            <StatCard
              title="Sessions Today"
              value={sessionStats.endedToday}
              icon={<CheckIcon />}
              accent="rose"
              sub="completed"
            />
            <StatCard
              title="Active Now"
              value={sessionStats.activeNow}
              icon={<LiveIcon />}
              accent="emerald"
              sub="in progress"
            />
          </div>
        </Section>

        <Section label="Session Metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile label="Started Today"  value={sessionStats.startedToday} color="teal" />
            <MetricTile label="Total All Time" value={sessionStats.totalAllTime} color="violet" />
            <MetricTile label="Avg Duration"   value={sessionStats.avgLabel}     color="indigo" isText />
          </div>
        </Section>

        {sessionStats.perStaff.length > 0 && (
          <Section label="Session Breakdown by Staff">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      {['Staff Member', 'Completed', 'Started', 'Total Time', 'Avg / Session'].map((h) => (
                        <th
                          key={h}
                          className={`py-3.5 px-5 text-[10px] font-black text-slate-400 uppercase tracking-widest ${h === 'Staff Member' ? 'text-left' : 'text-right'}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sessionStats.perStaff.map((s, i) => {
                      const totalH   = Math.floor(s.totalMinutes / 60);
                      const totalM   = s.totalMinutes % 60;
                      const totalStr = s.totalMinutes > 0 ? (totalH > 0 ? `${totalH}h ${totalM}m` : `${totalM}m`) : '—';
                      const avgM     = s.ended > 0 ? Math.round(s.totalMinutes / s.ended) : 0;
                      const avgH     = Math.floor(avgM / 60);
                      const avgMr    = avgM % 60;
                      const avgStr   = avgM > 0 ? (avgH > 0 ? `${avgH}h ${avgMr}m` : `${avgMr}m`) : '—';
                      const displayName = getDisplayName(s.uid, s.email);

                      return (
                        <tr key={s.uid} className="hover:bg-slate-50/70 transition-colors group">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <Avatar name={displayName} index={i} />
                              <span className="font-semibold text-slate-800 text-xs truncate max-w-[160px]">{displayName}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <Pill value={s.ended} color="rose" />
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <Pill value={s.started} color="teal" />
                          </td>
                          <td className="py-3.5 px-5 text-right text-xs font-semibold text-slate-600">{totalStr}</td>
                          <td className="py-3.5 px-5 text-right text-xs font-medium text-slate-400">{avgStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}

        <Section label="Staff Activity Monitor">
          {staffActivity.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center py-16">
              <p className="text-sm text-slate-400">No staff activity recorded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {staffActivity.map((staff, idx) => (
                <StaffCard key={staff.uid} staff={staff} rank={idx + 1} />
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
      {children}
    </div>
  );
}

const accentMap: Record<string, { bg: string; text: string; ring: string; icon: string }> = {
  indigo: { bg: 'bg-indigo-50',  text: 'text-indigo-700',  ring: 'ring-indigo-100',  icon: 'bg-indigo-600 text-white' },
  amber:  { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-100',   icon: 'bg-amber-500 text-white' },
  emerald:{ bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-100', icon: 'bg-emerald-500 text-white' },
  rose:   { bg: 'bg-rose-50',    text: 'text-rose-700',    ring: 'ring-rose-100',    icon: 'bg-rose-500 text-white' },
  teal:   { bg: 'bg-teal-50',    text: 'text-teal-700',    ring: 'ring-teal-100',    icon: 'bg-teal-500 text-white' },
  violet: { bg: 'bg-violet-50',  text: 'text-violet-700',  ring: 'ring-violet-100',  icon: 'bg-violet-600 text-white' },
};

function StatCard({
  title, value, icon, accent, link, sub,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  accent: string;
  link?: string;
  sub?: string;
}) {
  const a = accentMap[accent] || accentMap.indigo;

  const content = (
    <div className="group relative bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full ${a.bg} opacity-60 blur-xl pointer-events-none`} />
      <div className="relative flex items-start justify-between mb-5">
        <div className={`p-2.5 rounded-xl ${a.icon} shadow-sm`}>{icon}</div>
        {link && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
            <ArrowIcon />
          </div>
        )}
      </div>
      <p className="text-3xl font-black text-slate-900 leading-none mb-1.5">{value}</p>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );

  return link ? <Link href={link}>{content}</Link> : content;
}

function MetricTile({ label, value, color, isText }: { label: string; value: string | number; color: string; isText?: boolean }) {
  const a = accentMap[color] || accentMap.indigo;
  return (
    <div className={`${a.bg} rounded-2xl p-5 ring-1 ${a.ring}`}>
      <p className={`text-2xl sm:text-3xl font-black ${a.text} leading-none mb-1.5`}>{value}</p>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
    </div>
  );
}

function StaffCard({
  staff,
  rank,
}: {
  staff: { uid: string; displayName: string; email: string; count: number; recent: FirebaseTransaction[] };
  rank: number;
}) {
  const txTypeStyle: Record<string, string> = {
    adjustment: 'bg-amber-100 text-amber-700',
    sale:       'bg-emerald-100 text-emerald-700',
    dispense:   'bg-blue-100 text-blue-700',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={staff.displayName} index={rank - 1} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{staff.displayName}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{staff.count} total actions</p>
          </div>
        </div>
        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg">#{rank}</span>
      </div>

      <div>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Recent Activity</p>
        <div className="space-y-1.5">
          {staff.recent.length === 0 && (
            <p className="text-[10px] text-slate-400 italic py-1">No recent activity</p>
          )}
          {staff.recent.map((log, idx) => (
            <div key={idx} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2">
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${txTypeStyle[log.type] || 'bg-slate-100 text-slate-600'}`}>
                {log.type}
              </span>
              <span className="text-[10px] text-slate-500 flex-1 truncate">qty: {log.quantity}</span>
              <span className="text-[10px] text-slate-400 shrink-0">
                {new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const avatarColors = [
  'bg-indigo-600', 'bg-violet-600', 'bg-rose-500',
  'bg-teal-600',   'bg-amber-500',  'bg-emerald-600',
];

function Avatar({ name, index, size = 'sm' }: { name: string; index: number; size?: 'sm' | 'lg' }) {
  const color = avatarColors[index % avatarColors.length];
  const dim   = size === 'lg' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${dim} ${color} rounded-xl text-white flex items-center justify-center font-black shadow-sm shrink-0`}>
      {name[0].toUpperCase()}
    </div>
  );
}

function Pill({ value, color }: { value: number; color: string }) {
  const a = accentMap[color] || accentMap.indigo;
  return (
    <span className={`inline-flex items-center justify-center min-w-[2rem] px-2.5 py-1 rounded-lg ${a.bg} ${a.text} font-black text-sm ring-1 ${a.ring}`}>
      {value}
    </span>
  );
}

const i = (d: string) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const PeopleIcon = () => i('M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v1H1v-1a9 9 0 0118 0z');
const AlertIcon  = () => i('M12 9v2m0 4v2m0 5v1M7.08 6.47A9.969 9.969 0 0112 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12c0-1.821.487-3.53 1.333-5M12 12h.01');
const CheckIcon  = () => i('M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0');
const LiveIcon   = () => i('M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12h.01M8.464 15.536a5 5 0 010-7.072m7.072 0a5 5 0 010 7.072');
const ArrowIcon  = () => i('M17 8l4 4m0 0l-4 4m4-4H3');
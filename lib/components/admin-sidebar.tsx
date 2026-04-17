'use client';

import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import { useAuth } from '../auth/auth-context';
import { useSidebar } from '../contexts/sidebar-context';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import ConfirmationModal from './confirmation-modal';
import { database } from '../services/firebase';
import { ref, onValue } from 'firebase/database';

function AppLogo({ size = 42 }: { size?: number }) {
  return (
    <div className="shrink-0 rounded-full overflow-hidden flex items-center justify-center border border-slate-200 shadow-sm" style={{ width: size, height: size }}>
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

interface AdminSidebarItem {
  id: string;
  label: string;
  badge?: number;
  path?: string;
  hasDropdown?: boolean;
  subItems?: {
    id: string;
    label: string;
    path: string;
    badge?: number;
  }[];
}

const ADMIN_MENU: AdminSidebarItem[] = [
  { id: 'admin', label: 'Dashboard', path: '/admin-dashboard' },
  { id: 'inventory-records', label: 'Pharmacy Overview', path: '/admin-dashboard/reports/inventory' },
  { 
    id: 'staff-management', 
    label: 'Staff Management', 
    hasDropdown: true,
    subItems: [
      { id: 'staff-list', label: 'View All Staff', path: '/admin-dashboard/staff-list' },
      { id: 'create-staff', label: 'Create Staff Accounts', path: '/admin-dashboard/create-staff-accounts' },
      { id: 'activity-logs', label: 'Staff Activity Logs', path: '/admin-dashboard/logs' },
    ]
  },
  { id: 'system-notifications', label: 'System Notifications', path: '/admin-dashboard/system-notifications' },
];

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'staff';
  status: 'pending' | 'approved' | 'disabled';
  createdAt: string;
}

export default function AdminSidebar() {
  const { user, logOut, adminName } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const currentFilter = searchParams.get('filter');

  useEffect(() => {
    const usersRef = ref(database, 'users');
    const unsub = onValue(usersRef, (snap) => {
      const data = snap.val();
      if (data) {
        const pending = Object.values(data as Record<string, UserProfile>).filter((u) => u.status === 'pending').length;
        setPendingCount(pending);
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await logOut();
      router.push('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

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

  const getIcon = (id: string) => {
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
        return <svg {...p}><path d="M3 12h6m6 0h6M9 5h6m-6 14h6M3 9l3-3m0 12l-3-3m12 3l3-3m0-12l3 3" /></svg>;
      case 'inventory-records':
        return <svg {...p}><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m0-18h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9m0-18v18" /><path d="M9 9h6M9 15h6" /></svg>;
      case 'staff-management':
      case 'staff-list':
        return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>;
      case 'create-staff':
        return <svg {...p}><path d="M9 12l2 2 4-4m-9 8a9 9 0 1 1 18 0 9 9 0 0 1-18 0z" /></svg>;
      case 'activity-logs':
        return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" /></svg>;
      case 'system-notifications':
        return <svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
      case 'roles':
        return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
      case 'po-approvals':
        return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
      case 'receiving':
        return <svg {...p}><polyline points="17 10 12 15 7 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
      case 'sales-reports':
        return <svg {...p}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
      case 'inventory-reports':
        return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>;
      case 'activity-reports':
        return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14" /></svg>;
      case 'switch-to-staff':
        return <svg {...p}><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.87"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>;
      default: return null;
    }
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden fixed top-4 right-4 z-50">
        <button
          onClick={toggleSidebar}
          className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-lg text-slate-600 active:scale-95 transition-all"
        >
          {isCollapsed ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          )}
        </button>
      </div>

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-40 bg-white bg-opacity-95 backdrop-blur-xl border-r border-slate-200 
        shadow-xl lg:shadow-none lg:sticky lg:top-0 lg:h-screen lg:z-30
        transition-all duration-300 ease-in-out
        ${isCollapsed ? 'w-0 lg:w-20 -translate-x-full lg:translate-x-0' : 'w-72 lg:w-72 translate-x-0 lg:translate-x-0'}
      `}>
        
        {/* Header */}
        <div className={`border-b border-slate-200 border-opacity-70 flex items-center h-20 relative transition-all duration-300 ${isCollapsed ? 'p-2 lg:p-2' : 'p-4'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center justify-center w-full gap-1">
              <AppLogo size={40} />
              <button
                onClick={toggleSidebar}
                className="p-1 hover:bg-slate-100/80 rounded-lg transition-colors"
                title="Expand sidebar"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path strokeWidth={1.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <AppLogo size={36} />
                <div className="min-w-0">
                  <h2 className="text-sm font-black gradient-text leading-tight uppercase tracking-wider truncate">Admin Panel</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">Management Site</p>
                </div>
              </div>
              <button
                onClick={toggleSidebar}
                className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-colors shrink-0 ml-2"
                title="Collapse sidebar"
              >
                <svg className="w-5 h-5 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                  <path strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="p-3 space-y-1 overflow-y-auto custom-scrollbar transition-all duration-300" style={{ height: 'calc(100vh - 160px)' }}>
          {ADMIN_MENU.map((item) => {
            if (item.hasDropdown) {
              const isOpen = openDropdown === item.id;
              const isAnySubActive = item.subItems?.some(sub => isActive(sub.path));

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => isCollapsed ? router.push(item.subItems?.[0]?.path || '#') : setOpenDropdown(isOpen ? null : item.id)}
                    className={`w-full group relative flex items-center gap-3 rounded-xl transition-all border ${
                      isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'
                    } ${
                      isAnySubActive && !isOpen
                        ? 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm' 
                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className={`transition-transform duration-300 ${(isAnySubActive && !isOpen) ? 'scale-110 text-blue-600' : 'group-hover:scale-110 text-slate-500 group-hover:text-slate-700'}`}>
                      {getIcon(item.id)}
                    </span>
                    
                    {!isCollapsed && (
                      <>
                        <div className="flex-1 min-w-0 text-left">
                          <p className={`text-sm font-bold truncate ${(isAnySubActive && !isOpen) ? 'text-blue-700' : 'text-slate-600'}`}>
                            {item.label}
                          </p>
                        </div>
                        <svg className={`w-4 h-4 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </>
                    )}

                    {item.id === 'staff-management' && pendingCount > 0 && (
                      <span className={`flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black bg-red-500 text-white ${isCollapsed ? 'absolute top-2 right-2 border-2 border-white shadow-sm' : ''}`}>
                        {pendingCount}
                      </span>
                    )}
                  </button>

                  {isOpen && !isCollapsed && (
                     <div className="space-y-1 ml-4 pl-4 border-l border-slate-100">
                       {item.subItems?.map(sub => {
                         const subActive = isSubActive(sub.path);
                         const subBadge = sub.id === 'create-staff' ? pendingCount : sub.badge;

                        return (
                          <Link
                            key={sub.id}
                            href={sub.path}
                            className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                              subActive 
                                ? 'bg-blue-50 text-blue-700 shadow-sm' 
                                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-900'
                            }`}
                          >
                            <span className="truncate">{sub.label}</span>
                            {subBadge !== undefined && subBadge > 0 && (
                              <span className="flex items-center justify-center min-w-5 h-4 px-1 rounded-full text-[9px] font-black bg-red-500 text-white">
                                {subBadge}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active = isActive(item.path);
            const badgeValue = item.id === 'approvals' ? pendingCount : item.badge;

            return (
              <Link
                key={item.id}
                href={item.path || '#'}
                className={`group relative flex items-center gap-3 rounded-xl transition-all border ${
                  isCollapsed ? 'px-2 lg:px-2 py-2 lg:py-2' : 'px-4 py-3'
                } ${
                  active 
                    ? 'bg-blue-50 text-blue-700 border-blue-100 shadow-sm' 
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className={`transition-transform duration-300 ${active ? 'scale-110 text-blue-600' : 'group-hover:scale-110 text-slate-500 group-hover:text-slate-700'}`}>
                  {getIcon(item.id)}
                </span>
                
                {!isCollapsed && (
                  <div className="flex-1 min-w-0 text-left">
                    <p className={`text-sm font-bold truncate ${active ? 'text-blue-700' : 'text-slate-600'}`}>
                      {item.label}
                    </p>
                  </div>
                )}

                {badgeValue !== undefined && badgeValue > 0 && (
                  <span className={`flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black bg-red-500 text-white ${isCollapsed ? 'absolute top-2 right-2 border-2 border-white shadow-sm' : ''}`}>
                    {badgeValue}
                  </span>
                )}

                {active && !isCollapsed && (
                  <div className="absolute right-2 w-1 h-4 bg-blue-600 rounded-full opacity-50" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-slate-200 border-opacity-70 bg-white bg-opacity-90 backdrop-blur-lg space-y-3">
          {!isCollapsed && (
            <div className="px-3 py-2 bg-slate-50 rounded-xl text-left border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Admin Session</p>
              <p className="text-xs font-bold text-slate-900 truncate">{adminName || user?.email}</p>
            </div>
          )}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`w-full flex items-center justify-start gap-3 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-950 transition-all text-xs font-bold shadow-sm ${isCollapsed ? 'px-0 justify-center' : 'px-4'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        title="Sign Out Admin?"
        message="Are you sure you want to end your administrative session?"
        confirmText="Sign Out"
        isDangerous={true}
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  );
}

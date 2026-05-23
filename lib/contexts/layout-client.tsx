'use client';

import { useAuth } from '../auth/auth-context';
import { usePathname } from 'next/navigation';
import Sidebar from '../components/sidebar';
import AdminSidebarWrapper from '../components/admin-sidebar-wrapper';
import { ProtectedRoute } from '../auth/protected-route';
import { ReactNode } from 'react';

export default function LayoutClient({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const pathname = usePathname();

  const publicPages = [
    '/',
    '/login',
    '/admin-init',
    '/forgot-password',
    '/reset-password',
    '/account-disabled',
  ];

  const isPublicPage = publicPages.includes(pathname);
  const isAdminRoute = pathname.startsWith('/admin-dashboard');

  const showAdminSidebar = user && role === 'admin' && isAdminRoute;
  const showStaffSidebar = user && !isPublicPage && !isAdminRoute;

  const mainContent = !isPublicPage && !isAdminRoute ? (
    <ProtectedRoute>{children}</ProtectedRoute>
  ) : children;

  return (
    <div className="flex h-screen overflow-hidden">
      {showAdminSidebar && <AdminSidebarWrapper />}
      {showStaffSidebar && <Sidebar />}
      <main className={`flex-1 min-h-screen w-full transition-all duration-300 ease-in-out bg-slate-50/70 overflow-y-auto ${showStaffSidebar ? 'pt-14 pb-16 lg:pt-0 lg:pb-0' : ''}`}>
        {mainContent}
      </main>
    </div>
  );
}
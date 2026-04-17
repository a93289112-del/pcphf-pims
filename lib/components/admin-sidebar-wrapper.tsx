import { Suspense } from 'react';
import AdminSidebar from './admin-sidebar';

export default function AdminSidebarWrapper() {
  return (
    <Suspense fallback={
      <div className="w-20 h-screen bg-white border-r border-slate-200 shrink-0" />
    }>
      <AdminSidebar />
    </Suspense>
  );
}
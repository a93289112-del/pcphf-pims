'use client';

import { useAuth } from './auth-context';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';

export default function AdminGuard({ children }: { children: ReactNode }) {
  const { user, role, status, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (role !== 'admin') {
        router.push('/staff-dashboard');
      } else if (status !== 'approved') {
        router.push('/account-disabled');
      }
    }
  }, [user, role, status, loading, router]);

  if (loading || !user || role !== 'admin' || status !== 'approved') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

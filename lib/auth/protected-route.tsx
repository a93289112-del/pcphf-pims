'use client';

import { ReactNode } from 'react';
import { useAuth } from './auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, status, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (status === 'disabled') {
        router.push('/account-disabled');
      } else if (status !== 'approved') {
        router.push('/account-disabled');
      }
    }
  }, [user, status, loading, router]);

  if (loading) {
    return (
      <div className="login-container flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block">
            <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin"></div>
          </div>
          <p className="text-violet-300 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || status !== 'approved') {
    return null;
  }

  return <>{children}</>;
};

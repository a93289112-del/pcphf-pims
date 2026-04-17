'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useRouter } from 'next/navigation';

export default function AccountDisabled() {
  const { user, logOut } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-slate-100 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Account Disabled</h1>
        <p className="text-slate-500 mb-8">
          The account <span className="font-bold text-slate-700">{user?.email}</span> has been disabled by an administrator. 
          If you believe this is a mistake, please contact support.
        </p>
        <button
          onClick={() => logOut().then(() => router.push('/login'))}
          className="w-full py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}

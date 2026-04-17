'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { database } from '@/lib/services/firebase';
import { ref, get } from 'firebase/database';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAdminAndRedirect = async () => {
      try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        let adminExists = false;
        if (snapshot.exists()) {
          const users = snapshot.val() as Record<string, { role: string }>;
          adminExists = Object.values(users).some((u) => u.role === 'admin');
        }

        // Redirect based on admin existence
        if (adminExists) {
          router.push('/login');
        } else {
          router.push('/admin-init');
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        // Default to admin-init on error (safer assumption for first setup)
        router.push('/admin-init');
      } finally {
        setIsChecking(false);
      }
    };

    checkAdminAndRedirect();
  }, [router]);

  // Show loading state while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm tracking-wide">Initializing…</p>
        </div>
      </div>
    );
  }

  return null;
}

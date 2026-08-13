'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/services/firebase';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, status, role, signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (user && !loading) {
      if (status === 'approved') {
        if (role === 'admin') {
          router.push('/admin-dashboard');
        } else {
          router.push('/staff-dashboard');
        }
      } else if (status === 'disabled') {
        router.push('/account-disabled');
      }
    }
  }, [user, loading, status, role, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();
    setIsLoading(true);

    try {
      if (!email || !password) {
        setLocalError('Please fill in all fields');
        setIsLoading(false);
        return;
      }
      await signIn(email, password);
      setIsLoading(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : error || 'Failed to sign in';
      setLocalError(errorMessage);
      setIsLoading(false);
    }
  };

  const displayError = localError || error;

  // ── Pending approval screen ────────────────────────────────────────────────
  if (user && !loading && status === 'pending') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
        <div className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-4">
            <svg className="w-16 h-16 mx-auto text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Pending Approval</h2>
          <p className="text-gray-600 mb-6">
            Your account has been registered successfully. An administrator is reviewing your request and will approve your access soon.
          </p>
          <button
            onClick={() => {
              signOut(auth).catch(console.error);
              router.push('/login');
            }}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ── Main login page ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 flex flex-col lg:flex-row">

      {/* ── LEFT / TOP: Hero branding ────────────────────────────────────────── */}
      <div className="
        flex-1 flex flex-col justify-center
        px-8 pt-12 pb-8
        sm:px-12 sm:pt-16 sm:pb-10
        lg:px-16 lg:py-0 lg:min-h-screen
        max-w-full lg:max-w-[55%]
      ">
        <div className="space-y-5 lg:space-y-6 max-w-xl">
          {/* Eyebrow */}
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-400">
            Passi City
          </p>

          {/* Main headline — scales fluidly */}
          <div className="leading-none">
            <div className="text-[clamp(2.8rem,10vw,7rem)] font-black text-blue-600 tracking-tight leading-none">
              Primary
            </div>
            <div className="text-[clamp(2.8rem,10vw,7rem)] font-black text-blue-600 tracking-tight leading-none">
              Pharmacy
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="h-[3px] w-10 sm:w-16 bg-slate-900 rounded-full shrink-0" />
              <div className="text-[clamp(1.6rem,5.5vw,4rem)] font-black text-slate-900 tracking-tight leading-none">
                Health <span className="text-blue-600">Facility</span>
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-base sm:text-lg lg:text-xl text-slate-500 max-w-sm leading-relaxed font-light">
            Streamline your pharmaceutical operations with intelligent, real-time inventory management
          </p>

          {/* Animated dots */}
          <div className="flex gap-2.5 pt-2 lg:pt-6">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse animation-delay-200" />
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse animation-delay-400" />
          </div>
        </div>
      </div>

      {/* ── RIGHT / BOTTOM: Login form ───────────────────────────────────────── */}
      <div className="
        flex items-center justify-center
        px-6 pb-12 pt-4
        sm:px-12 sm:pb-16
        lg:px-16 lg:py-0 lg:min-h-screen lg:w-[45%] lg:shrink-0
      ">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-7 sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Sign In</h2>

            {displayError && (
              <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800 mb-1">Login Failed</p>
                  <p className="text-sm text-red-700">{displayError}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setLocalError(''); }}
                  placeholder="Enter your email"
                  className={`w-full px-4 py-2.5 input-field rounded-lg placeholder-opacity-50 transition-colors ${displayError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                    }`}
                  disabled={isLoading || loading}
                  required
                  suppressHydrationWarning
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setLocalError(''); }}
                    placeholder="Enter your password"
                    className={`w-full px-4 py-2.5 pr-11 input-field rounded-lg placeholder-opacity-50 transition-colors ${displayError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                      }`}
                    disabled={isLoading || loading}
                    required
                    suppressHydrationWarning
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || loading}
                className="w-full py-2.5 px-4 btn-primary rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isLoading || loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-4">
              <Link
                href="/forgot-password"
                className="text-sm text-blue-600 font-semibold hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
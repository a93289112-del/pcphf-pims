'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { auth, database } from '@/lib/services/firebase';
import { ref, set, get } from 'firebase/database';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const [adminExists, setAdminExists] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setPasswordConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Pharmacy Registration Details
  const [pharmacyName, setPharmacyName] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');
  const [pharmacyEmail, setPharmacyEmail] = useState('');
  const [pharmacyType, setPharmacyType] = useState('Retail');
  const [licenseNumber, setLicenseNumber] = useState('');

  // Key Personnel - Pharmacist-in-Charge
  const [picName, setPicName] = useState('');
  const [picLicenseNumber, setPicLicenseNumber] = useState('');
  const [picContactDetails, setPicContactDetails] = useState('');

  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      try {
        const usersRef = ref(database, 'users');
        const snapshot = await get(usersRef);

        if (isMounted) {
          if (snapshot.exists()) {
            const users = snapshot.val() as Record<string, { role: string }>;
            const existingAdmin = Object.values(users).find((u) => u.role === 'admin');
            setAdminExists(!!existingAdmin);
            
            // If no admin exists, redirect to admin-init
            if (!existingAdmin) {
              router.push('/admin-init');
            }
          } else {
            // No users exist, redirect to admin-init to create admin first
            router.push('/admin-init');
          }
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        if (isMounted) {
          setAdminExists(true); // Assume admin exists on error for safety
        }
      }
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    // Validate pharmacy details
    if (!pharmacyName.trim()) {
      setError('Pharmacy name is required');
      return;
    }

    if (!physicalAddress.trim()) {
      setError('Physical address is required');
      return;
    }

    if (!licenseNumber.trim()) {
      setError('License/Permit number is required');
      return;
    }

    if (!picName.trim()) {
      setError('Pharmacist-in-Charge name is required');
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Create user profile in Realtime Database as staff (pending approval)
      // Admin creation now happens through the dedicated admin-init page
      await set(ref(database, `users/${user.uid}`), {
        uid: user.uid,
        email: user.email,
        role: 'staff',
        status: 'pending',
        createdAt: new Date().toISOString(),
        // Pharmacy Registration Details
        pharmacy: {
          name: pharmacyName.trim(),
          address: physicalAddress.trim(),
          phone: pharmacyPhone.trim(),
          email: pharmacyEmail.trim(),
          type: pharmacyType,
          licenseNumber: licenseNumber.trim(),
        },
        // Key Personnel - Pharmacist-in-Charge
        pharmacistInCharge: {
          fullName: picName.trim(),
          licenseNumber: picLicenseNumber.trim(),
          contactDetails: picContactDetails.trim(),
        },
      });

      // All staff registrations are auto-approved by admin
      router.push('/login');
    } catch (err) {
      if (err instanceof FirebaseError) {
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists. Try signing in.');
        } else if (err.code === 'PERMISSION_DENIED') {
          setError('Database permission denied. Please contact an administrator.');
          console.error('Database Error:', err);
        } else {
          setError(`Error: ${err.message}`);
          console.error('Firebase Auth Error:', err);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
        console.error('Unexpected Registration Error:', err);
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* Hero Section - Left Side */}
      <div className="absolute inset-0 flex flex-col items-start justify-center pl-8 md:pl-12 lg:pl-24 max-w-3xl pr-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-blue-400 leading-none tracking-tight mb-1">
              Join
            </h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">
              Pharma
            </h1>
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-blue-600 leading-none tracking-tight mb-2">
              Sync
            </h1>
            <div className="flex items-center gap-3 mt-3">
              <div className="h-1 w-20 bg-gray-900 rounded-full"></div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 leading-none tracking-tight">
                Staff <span className="text-blue-600">Portal</span>
              </h1>
            </div>
          </div>
          <p className="text-xl md:text-2xl text-gray-600 max-w-lg leading-relaxed font-light">
            Request access to the pharmacy management system.
          </p>
        </div>
      </div>

      {/* Register Form - Right Side */}
      <div className="absolute inset-0 flex items-center justify-end pr-8 lg:pr-16">
        <div className="w-full max-w-md">
          <div className="login-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Staff Registration</h2>

            {adminExists === null && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 font-medium text-sm flex items-center gap-3">
                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v6m6 0h-6m0 6v6m0-6H6" />
                </svg>
                Checking system setup...
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6 max-h-96 overflow-y-auto pr-2">
              {/* Account Credentials Section */}
              <div className="border-b pb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Credentials</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Basic Information Section */}
              <div className="border-b pb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pharmacy Information</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pharmacy Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={pharmacyName}
                    onChange={(e) => setPharmacyName(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Physical Address <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={physicalAddress}
                    onChange={(e) => setPhysicalAddress(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={pharmacyPhone}
                      onChange={(e) => setPharmacyPhone(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={pharmacyEmail}
                      onChange={(e) => setPharmacyEmail(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pharmacy Type <span className="text-red-500">*</span></label>
                    <select
                      value={pharmacyType}
                      onChange={(e) => setPharmacyType(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      disabled={isLoading}
                    >
                      <option>Retail</option>
                      <option>Hospital</option>
                      <option>Compounding</option>
                      <option>Online</option>
                      <option>Clinic</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">License/Permit Number <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {/* Key Personnel Section */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pharmacist-in-Charge (PIC)</h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Full Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={picName}
                    onChange={(e) => setPicName(e.target.value)}
                    className="w-full px-4 py-2 input-field rounded-lg"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Professional License Number</label>
                    <input
                      type="text"
                      value={picLicenseNumber}
                      onChange={(e) => setPicLicenseNumber(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Contact Details</label>
                    <input
                      type="tel"
                      value={picContactDetails}
                      onChange={(e) => setPicContactDetails(e.target.value)}
                      className="w-full px-4 py-2 input-field rounded-lg"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || adminExists === null}
                className="w-full py-2 px-4 btn-primary rounded-lg font-semibold disabled:opacity-50 mt-6"
              >
                {isLoading ? 'Creating Request...' : adminExists === null ? 'Checking system...' : 'Request Account'}
              </button>
            </form>

            <p className="text-center text-gray-600 text-sm mt-6">
              Already have an account? <Link href="/login" className="text-blue-600 font-bold hover:underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

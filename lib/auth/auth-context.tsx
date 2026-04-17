'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth, database } from '../services/firebase';
import { ref, onValue, get } from 'firebase/database';
import { logActivity, updateStaffActiveStatus } from '../services/activity-logs';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'staff' | null;
  status: 'pending' | 'approved' | 'disabled' | null;
  pharmacyName: string | null;
  pharmacistInChargeName: string | null;
  staffName: string | null;
  adminName: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'staff' | null>(null);
  const [status, setStatus] = useState<'pending' | 'approved' | 'disabled' | null>(null);
  const [pharmacyName, setPharmacyName] = useState<string | null>(null);
  const [pharmacistInChargeName, setPharmacistInChargeName] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [adminName, setAdminName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error('Persistence error:', err);
    });

    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // Cleanup previous profile listener
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (currentUser) {
        const userRef = ref(database, `users/${currentUser.uid}`);
        profileUnsubscribe = onValue(
          userRef,
          (snapshot) => {
            const profile = snapshot.val();
            if (profile) {
              setRole(profile.role);
              setStatus(profile.status);
              
              // Handle admin name
              if (profile.role === 'admin') {
                setAdminName(profile.name || null);
              } else {
                setAdminName(null);
              }
              
              // Handle both staff name types
              if (profile.role === 'staff' && profile.staffName) {
                setStaffName(profile.staffName);
                setPharmacistInChargeName(profile.staffName);
              } else {
                setStaffName(profile.staffName || null);
                setPharmacistInChargeName(
                  profile.pharmacistInCharge?.fullName || profile.staffName || currentUser.email || 'User'
                );
              }
            } else {
              // Profile doesn't exist yet (e.g. during registration)
              setRole(null);
              setStatus(null);
              setPharmacyName(null);
              setStaffName(null);
              setAdminName(null);
              setPharmacistInChargeName(null);
            }
            // Always resolve loading regardless of whether profile data exists
            setLoading(false);
          },
          (err) => {
            console.error('Profile read error:', err);
            setLoading(false);
          }
        );
      } else {
        // No user logged in — clear everything and stop loading
        setRole(null);
        setStatus(null);
        setPharmacyName(null);
        setStaffName(null);
        setPharmacistInChargeName(null);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;
      
      // Get the user's role and name
      let userRole: 'admin' | 'staff' | undefined = undefined;
      let userName: string = email;
      try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
          const profile = snapshot.val();
          userRole = profile.role;
          // Use admin name for admins, staffName for staff
          if (profile.role === 'admin' && profile.name) {
            userName = profile.name;
          } else if (profile.role === 'staff' && profile.staffName) {
            userName = profile.staffName;
          }
        }
      } catch (getRoleError) {
        console.error('Failed to get user role and name:', getRoleError);
      }
      
      // Log the login activity
      try {
        const activityType = userRole === 'admin' ? 'admin_login' : 'staff_login';
        await logActivity(
          activityType,
          userId,
          email,
          `${userName} logged in successfully`,
          undefined,
          userName,
          userRole
        );

        // Update staff active status
        await updateStaffActiveStatus(userId, true);
      } catch (logError) {
        console.error('Failed to log login activity:', logError);
      }
    } catch (err) {
      const error = err as { code?: string };
      const errorMessage = getAuthErrorMessage(error.code ?? '');
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const logOut = async () => {
    setError(null);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Get the user's role and name
        let userRole: 'admin' | 'staff' | undefined = undefined;
        let userName: string = currentUser.email || 'unknown';
        try {
          const userRef = ref(database, `users/${currentUser.uid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const profile = snapshot.val();
            userRole = profile.role;
            // Use admin name for admins, staffName for staff
            if (profile.role === 'admin' && profile.name) {
              userName = profile.name;
            } else if (profile.role === 'staff' && profile.staffName) {
              userName = profile.staffName;
            }
          }
        } catch (getRoleError) {
          console.error('Failed to get user role and name:', getRoleError);
        }
        
        try {
          const activityType = userRole === 'admin' ? 'admin_logout' : 'staff_logout';
          await logActivity(
            activityType,
            currentUser.uid,
            currentUser.email || 'unknown',
            `${userName} logged out`,
            undefined,
            userName,
            userRole
          );

          // Update staff active status
          await updateStaffActiveStatus(currentUser.uid, false);
        } catch (logError) {
          console.error('Failed to log logout activity:', logError);
        }
      }

      await signOut(auth);
    } catch (err) {
      const error = err as { code?: string };
      const errorMessage = getAuthErrorMessage(error.code ?? '');
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const clearError = () => setError(null);

  const value: AuthContextType = {
    user,
    role,
    status,
    pharmacyName,
    staffName,
    adminName,
    pharmacistInChargeName,
    loading,
    error,
    signIn,
    logOut,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const getAuthErrorMessage = (code: string): string => {
  switch (code) {
    case 'auth/user-not-found':
      return 'No account found with this email address.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please try again later.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/password accounts are not enabled.';
    default:
      return 'An error occurred. Please try again.';
  }
};
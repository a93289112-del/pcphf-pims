import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCvmb8K2IOzWfHFnMicjD8cp5n_Z1fLYG0",
  authDomain: "pharmacy-ims00.firebaseapp.com",
  databaseURL: "https://pharmacy-ims00-default-rtdb.firebaseio.com",
  projectId: "pharmacy-ims00",
  storageBucket: "pharmacy-ims00.firebasestorage.app",
  messagingSenderId: "285847494748",
  appId: "1:285847494748:web:1aa10e860a18193e724699"
};

// Initialize Firebase - Primary instance for admin sessions
const app = initializeApp(firebaseConfig);

// Initialize Firebase - Secondary instance for staff account creation (isolated auth)
const secondaryApp = initializeApp(firebaseConfig, 'secondary');

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Secondary auth instance - used only for creating staff accounts
// This prevents staff creation from affecting the admin's primary session
export const secondaryAuth = getAuth(secondaryApp);

// Initialize Realtime Database and get a reference to the service
export const database = getDatabase(app);

/**
 * Returns a global path for shared data (medicines, transactions, etc.)
 * All users (staff) share the same centralized inventory.
 * This replaces the old user-scoped system with a single-admin, multi-staff design.
 */
export const getUserPath = (uid: string | undefined, path: string) => {
  if (!uid) return path;
  
  // Critical inventory data is now globally shared across all staff
  const globalPaths = ['medicines', 'transactions', 'stockAdjustments', 'dispensings', 'activityLogs', 'patients'];
  const isGlobalPath = globalPaths.some(p => path.startsWith(p));
  
  if (isGlobalPath) {
    // Return global path for shared inventory
    return path;
  }
  
  // Keep user-scoped paths for user-specific data (if needed in future)
  return `userData/${uid}/${path}`;
};

export default app;

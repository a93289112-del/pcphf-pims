import { database, getUserPath } from './firebase';
import { ref, onValue, push, set, get } from 'firebase/database';

export interface PatientRecord {
  id?: string;
  lastName: string;
  firstName: string;
  middleName: string;
  dateOfBirth: string;
  sex: 'Male' | 'Female' | '';
  patientContactNo: string;
  // Full patient object stored for quick retrieval
  fullPatientData: Record<string, unknown>;
  createdAt?: string;
  lastUpdated?: string;
}

/**
 * Migrate patients from old user-scoped path to global path (one-time migration)
 */
const migrateOldPatients = async (userId: string): Promise<void> => {
  try {
    // Check if patients already exist in global path
    const globalPatientsSnapshot = await get(ref(database, 'patients'));
    if (globalPatientsSnapshot.exists()) {
      console.log('[migrateOldPatients] Global patients already exist, skipping migration');
      return;
    }

    // Check old user-scoped path
    const oldPath = `userData/${userId}/patients`;
    const oldPatientsSnapshot = await get(ref(database, oldPath));
    
    if (!oldPatientsSnapshot.exists()) {
      console.log('[migrateOldPatients] No old patients to migrate');
      return;
    }

    console.log('[migrateOldPatients] Found patients in old location, migrating...');
    const oldPatients = oldPatientsSnapshot.val() as Record<string, Record<string, unknown>>;
    
    // Copy each patient to new global location
    Object.entries(oldPatients).forEach(async ([patientId, patient]: [string, Record<string, unknown>]) => {
      await set(ref(database, `patients/${patientId}`), patient);
      console.log('[migrateOldPatients] Migrated patient:', patientId);
    });

    console.log('[migrateOldPatients] Migration complete');
  } catch (error) {
    console.error('[migrateOldPatients] Error during migration:', error);
    // Don't throw - migration failure shouldn't break the app
  }
};

/**
 * Save or update a patient record
 */
export const savePatientRecord = async (userId: string, patientData: Record<string, unknown>): Promise<string> => {
  try {
    const patientsPath = getUserPath(userId, 'patients');
    
    console.log('[savePatientRecord] Saving to path:', patientsPath);
    console.log('[savePatientRecord] Patient data:', {
      lastName: patientData.lastName,
      firstName: patientData.firstName,
      middleName: patientData.middleName,
      dateOfBirth: patientData.dateOfBirth,
    });
    
    // Extract and type-assert patient fields
    const lastName = String(patientData.lastName || '');
    const firstName = String(patientData.firstName || '');
    const middleName = String(patientData.middleName || '');
    const dateOfBirth = String(patientData.dateOfBirth);
    const sex = patientData.sex as 'Male' | 'Female' | '';
    const patientContactNo = String(patientData.patientContactNo || '');
    
    // Create a searchable patient record
    const patientRecord: PatientRecord = {
      lastName,
      firstName,
      middleName,
      dateOfBirth,
      sex,
      patientContactNo,
      fullPatientData: patientData,
      lastUpdated: new Date().toISOString(),
    };

    // Check if patient already exists (by name + DOB + contact)
    const existingPatientId = await findExistingPatient(userId, patientData);
    
    if (existingPatientId) {
      // Update existing patient
      console.log('[savePatientRecord] Updating existing patient:', existingPatientId);
      await set(ref(database, `${patientsPath}/${existingPatientId}`), {
        ...patientRecord,
        createdAt: (await getPatientById(userId, existingPatientId))?.createdAt || new Date().toISOString(),
      });
      return existingPatientId;
    } else {
      // Create new patient record
      console.log('[savePatientRecord] Creating new patient');
      const patientRef = push(ref(database, patientsPath));
      const patientId = patientRef.key;
      if (!patientId) throw new Error('Failed to generate patient ID');

      await set(patientRef, {
        ...patientRecord,
        createdAt: new Date().toISOString(),
      });
      console.log('[savePatientRecord] Created patient with ID:', patientId);
      return patientId;
    }
  } catch (error) {
    console.error('Error saving patient record:', error);
    throw error;
  }
};

/**
 * Find existing patient by name, DOB, and contact
 */
const findExistingPatient = async (userId: string, patientData: Record<string, unknown>): Promise<string | null> => {
  try {
    const patients = await getAllPatients(userId);
    const lastNameInput = String(patientData.lastName || '');
    const firstNameInput = String(patientData.firstName || '');
    const match = patients.find(
      (p) =>
        p.lastName.toLowerCase() === lastNameInput.toLowerCase() &&
        p.firstName.toLowerCase() === firstNameInput.toLowerCase() &&
        p.dateOfBirth === patientData.dateOfBirth
    );
    return match?.id || null;
  } catch {
    return null;
  }
};

/**
 * Get all patients for a user
 */
export const getAllPatients = async (userId: string): Promise<PatientRecord[]> => {
  return new Promise((resolve) => {
    try {
      const patientsPath = getUserPath(userId, 'patients');
      let unsub: (() => void) | null = null;
      unsub = onValue(
        ref(database, patientsPath),
        (snapshot) => {
          const data = snapshot.val() as Record<string, Omit<PatientRecord, 'id'>> | null;
          const patients: PatientRecord[] = data
            ? Object.entries(data).map(([id, value]: [string, Omit<PatientRecord, 'id'>]) => ({
                id,
                ...value,
              }))
            : [];
          resolve(patients);
          if (unsub) unsub();
        },
        (error) => {
          console.error('Error getting all patients:', error);
          // Resolve with empty array on error to prevent hanging
          resolve([]);
          if (unsub) unsub();
        }
      );
    } catch (error) {
      console.error('Error in getAllPatients:', error);
      resolve([]);
    }
  });
};

/**
 * Get patient by ID
 */
export const getPatientById = async (userId: string, patientId: string): Promise<PatientRecord | null> => {
  return new Promise((resolve, reject) => {
    try {
      const patientsPath = getUserPath(userId, 'patients');
      let unsub: (() => void) | null = null;
      unsub = onValue(
        ref(database, `${patientsPath}/${patientId}`),
        (snapshot) => {
          const data = snapshot.val();
          resolve(
            data
              ? {
                  id: patientId,
                  ...data,
                }
              : null
          );
          if (unsub) unsub();
        },
        (error) => {
          reject(error);
        }
      );
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Listen to patients in real-time
 */
export const listenToPatients = (userId: string, callback: (patients: PatientRecord[]) => void) => {
  try {
    // Attempt migration on first load
    migrateOldPatients(userId).catch(console.error);
    
    const patientsPath = getUserPath(userId, 'patients');
    console.log('[listenToPatients] Listening to path:', patientsPath);
    
    const unsub = onValue(
      ref(database, patientsPath),
      (snapshot) => {
        const data = snapshot.val() as Record<string, Omit<PatientRecord, 'id'>> | null;
        console.log('[listenToPatients] Retrieved data:', data);
        
        const patients: PatientRecord[] = data
          ? Object.entries(data).map(([id, value]: [string, Omit<PatientRecord, 'id'>]) => ({
              id,
              ...value,
            }))
          : [];
        
        console.log('[listenToPatients] Parsed patients:', patients);
        callback(patients);
      },
      (error) => {
        console.error('Error listening to patients:', error);
        // Call callback with empty array to unload loading state
        callback([]);
      }
    );
    return unsub;
  } catch (error) {
    console.error('Error setting up patient listener:', error);
    // Return a no-op unsubscribe function
    return () => {};
  }
};

/**
 * Get patient display name
 */
export const getPatientDisplayName = (patient: PatientRecord): string => {
  // Handle undefined or missing fields gracefully
  const lastName = patient?.lastName?.trim() || '';
  const firstName = patient?.firstName?.trim() || '';
  const middleName = patient?.middleName?.trim() || '';
  
  const parts = [lastName, firstName, middleName].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Unknown Patient';
};

/**
 * Search patients by name
 */
export const searchPatients = async (userId: string, searchTerm: string): Promise<PatientRecord[]> => {
  try {
    const patients = await getAllPatients(userId);
    const term = searchTerm.toLowerCase().trim();
    if (!term) return patients;
    
    return patients.filter((p) => {
      const displayName = getPatientDisplayName(p).toLowerCase();
      const contact = (p.patientContactNo || '').toLowerCase();
      return displayName.includes(term) || contact.includes(term);
    });
  } catch (error) {
    console.error('Error searching patients:', error);
    return [];
  }
};

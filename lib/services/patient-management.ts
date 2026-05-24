import { database, getUserPath } from './firebase';
import { ref, onValue, push, set, get, remove } from 'firebase/database';
import { getCurrentDateISO } from '../utils/date-timezone';

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
      lastUpdated: getCurrentDateISO(),
    };

    // Check if patient already exists (by name + DOB + contact)
    const existingPatientId = await findExistingPatient(userId, patientData);

    if (existingPatientId) {
      // Update existing patient
      console.log('[savePatientRecord] Updating existing patient:', existingPatientId);
      await set(ref(database, `${patientsPath}/${existingPatientId}`), {
        ...patientRecord,
        createdAt: (await getPatientById(userId, existingPatientId))?.createdAt || getCurrentDateISO(),
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
        createdAt: getCurrentDateISO(),
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
  } catch (error) {
    // Log error but allow caller to handle gracefully
    console.error('[findExistingPatient] Error finding existing patient:', error);
    // Return null to indicate no match found, but allow operation to continue
    return null;
  }
};


/**
 * Delete a patient record by ID
 */
export const deletePatientRecord = async (userId: string, patientId: string): Promise<void> => {
  try {
    const patientsPath = getUserPath(userId, 'patients');
    await remove(ref(database, `${patientsPath}/${patientId}`));
    console.log('[deletePatientRecord] Deleted patient:', patientId);
  } catch (error) {
    console.error('Error deleting patient record:', error);
    throw error;
  }
};
/**
 * Get all patients for a user
 */
export const getAllPatients = async (userId: string): Promise<PatientRecord[]> => {
  return new Promise((resolve, reject) => {
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
          // Reject promise to allow proper error handling
          reject(error);
          if (unsub) unsub();
        }
      );
    } catch (error) {
      console.error('Error in getAllPatients:', error);
      reject(error);
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
 * @param userId User ID
 * @param callback Called with patient array on data changes
 * @param errorCallback Called if error occurs (optional)
 */
export const listenToPatients = (
  userId: string,
  callback: (patients: PatientRecord[]) => void,
  errorCallback?: (error: Error) => void
) => {
  try {
    // REMOVED: migrateOldPatients(userId).catch(console.error);

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
        // Call error callback instead of silently calling with empty array
        if (errorCallback) {
          errorCallback(error instanceof Error ? error : new Error(String(error)));
        }
      }
    );
    return unsub;
  } catch (error) {
    console.error('Error setting up patient listener:', error);
    // Call error callback for synchronous errors too
    if (errorCallback) {
      errorCallback(error instanceof Error ? error : new Error(String(error)));
    }
    return () => { };
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

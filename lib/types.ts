export type TransactionType = 'dispense' | 'sale' | 'adjustment';

export interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

export interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  category?: string;
  quantity?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  piecesPerUnit?: number;
  unitCost?: number;
  sellingPrice?: number;
  totalCost?: number;
  containerQuantity?: number;
  minStock?: number;
  expirationDate?: string; // Always the earliest expiration from batches
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations (keyed by batchId)
  strength?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FirebaseTransaction {
  date: string;
  type: 'dispense' | 'sale' | 'adjustment';
  medicineId: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  userId?: string;
  notes?: string;
  unitCost?: number;
  unitPrice?: number;
  referenceId?: string;
}

export interface UserDataEntry {
  medicines?: Record<string, Omit<Medicine, 'id'>>;
  transactions?: Record<string, FirebaseTransaction>;
}

export type AllUserData = Record<string, UserDataEntry>;

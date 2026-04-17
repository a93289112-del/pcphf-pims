export interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

export interface Medicine {
  id: string;
  name: string;
  category: string;
  brand: string;
  image: string;
  description: string;
  pricePerUnit?: number;
  pricePerPieces?: number;
  stockPerUnit?: number;
  stockPerPieces?: number;
  quantity?: number;
  minStock?: number;
  unitConversion?: {
    conversionFactor?: number;
  } | null;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  createdAt: string;
}

export type StockFilter = 'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out';

export type StockStatus = 'expired' | 'expiring' | 'out' | 'low' | 'in';

export interface StatusDisplay {
  label: string;
  color: string;
}

export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getTodayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function checkExpired(expirationDate?: string): boolean {
  if (!expirationDate) return false;
  return parseLocalDate(expirationDate) < getTodayMidnight();
}

export function checkExpiringSoon(expirationDate?: string): boolean {
  if (!expirationDate) return false;
  const expDate = parseLocalDate(expirationDate);
  const today = getTodayMidnight();
  const days = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return days >= 0 && days <= 30;
}

export function getFieldStatus(
  stock: number,
  minStock: number,
  expirationDate?: string
): StockStatus {
  if (checkExpired(expirationDate)) return 'expired';
  if (checkExpiringSoon(expirationDate)) return 'expiring';
  if (stock === 0) return 'out';
  if (minStock > 0 && stock <= minStock) return 'low';
  return 'in';
}

export function statusDisplay(status: StockStatus): StatusDisplay {
  switch (status) {
    case 'expired':
      return { label: 'Expired', color: 'bg-black text-white' };
    case 'expiring':
      return { label: 'Expiring', color: 'bg-orange-100 text-orange-700' };
    case 'out':
      return { label: 'Out', color: 'bg-red-100 text-red-700' };
    case 'low':
      return { label: 'Low', color: 'bg-yellow-100 text-yellow-700' };
    case 'in':
      return { label: 'In Stock', color: 'bg-green-100 text-green-700' };
  }
}

export function getMedicineOverallStatus(medicine: Medicine): {
  expired: boolean;
  expiring: boolean;
  out: boolean;
  low: boolean;
  inStock: boolean;
} {
  const expired = checkExpired(medicine.expirationDate);
  const expiring = !expired && checkExpiringSoon(medicine.expirationDate);
  
  // Consistent stock calculation across the app
  const unitStock = medicine.stockPerUnit ?? 0;
  const piecesStock = medicine.stockPerPieces ?? 0;
  const quantity = medicine.quantity;
  const factor = medicine.unitConversion?.conversionFactor ?? 1;

  // Use quantity if available, otherwise use the maximum of unitStock and piecesStock
  const rawStock = (quantity !== undefined) ? quantity : Math.max(unitStock, piecesStock);
  
  // Calculate effective stock in input units (e.g., Boxes) if there's a conversion factor
  // This is because minStock is typically set in terms of the input unit.
  const effectiveStock = factor > 1 ? rawStock / factor : rawStock;
  const minStock = medicine.minStock ?? 0;
  
  const out = rawStock === 0;
  const low = !expired && !expiring && !out && minStock > 0 && effectiveStock <= minStock;
  const inStock = !expired && !expiring && !out && !low;
  
  return { expired, expiring, out, low, inStock };
}

export function countByStatus(medicines: Medicine[]) {
  let expired = 0;
  let expiring = 0;
  let out = 0;
  let low = 0;
  let inStock = 0;
  for (const m of medicines) {
    const s = getMedicineOverallStatus(m);
    if (s.expired) expired++;
    else if (s.expiring) expiring++;
    else if (s.out) out++;
    else if (s.low) low++;
    else inStock++;
  }
  return { expired, expiring, out, low, inStock, totalAlerts: expired + expiring + out + low };
}

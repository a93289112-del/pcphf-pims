'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSidebar } from '@/lib/contexts/sidebar-context';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, push, set } from 'firebase/database';
import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import Processing from '@/lib/components/processing';
import { deductStockBatch, getTrueEarliestExpiration } from '@/lib/services/stock-management';
import { logActivity } from '@/lib/services/activity-logs';
import { CheckCircle2, Plus, Minus, X } from 'lucide-react';
import { listenToPatients, savePatientRecord, getPatientDisplayName, type PatientRecord } from '@/lib/services/patient-management';

type DispensableUnit = string;

// ─── Interfaces ────────────────────────────────────────────────────────────────
interface MedicineBatch {
  quantity: number;
  expirationDate: string;
  createdAt?: string;
}

interface Medicine {
  id: string;
  name?: string;
  baseName?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  originalUnit?: string;
  brandModel?: string;
  countryOfOrigin?: string;
  ageGroup?: string;
  unitCost?: number;
  totalCost?: number;
  strength?: string;
  strengths?: string[] | null;
  category?: string;
  brand?: string;
  image?: string;
  stockPerUnit?: number;
  stockPerPieces?: number;
  minStock?: number;
  expirationDate?: string;
  batches?: Record<string, MedicineBatch>; // FIFO batches with individual expirations
  prescriptionRequired?: boolean;
  createdAt: string;
  piecesPerUnit?: number;
  totalPieces?: number;
  containerQuantity?: number;
  unitConversion?: {
    packagingUnit?: string;
    conversionUnit?: string;
    conversionFactor?: number;
    customUnitName?: string;
  } | null;
}

interface DispenseItem {
  medicine: Medicine;
  quantity: number;
  unitType: DispensableUnit;
  selectedStrength?: string;
}

type MedicineRecord = Omit<Medicine, 'id'>;

interface PatientInfo {
  lastName: string; firstName: string; middleName: string; suffix: string; maidenName: string;
  sex: 'Male' | 'Female' | ''; dateOfBirth: string; placeOfBirth: string;
  bloodType: string; religion: string; residentialAddress: string;
  civilStatus: 'Single' | 'Married' | 'Widow' | 'Separated' | 'Annulled' | 'Co-Habitation' | '';
  spouseName: string;
  educationalAttainment: 'No Formal Education' | 'Elementary' | 'High School' | 'Vocational' | 'College' | 'Post Graduate' | '';
  employmentStatus: 'Student' | 'Employed' | 'Retired' | 'Unemployed' | 'Unknown' | '';
  occupation: string;
  familyMemberPosition: 'Father' | 'Mother' | 'Son' | 'Daughter' | 'Others' | '';
  familyMemberOther: string; patientContactNo: string; motherName: string; motherDateOfBirth: string;
  dswdNhts: 'YES' | 'NO' | ''; familyHouseholdNumber: string;
  fourPsMember: 'YES' | 'NO' | ''; householdNumber: string;
  philhealthMember: 'YES' | 'NO' | '';
  philhealthStatusType: 'Member' | 'Dependent' | '';
  philhealthRelationship: 'Child' | 'Parent' | 'Spouse' | '';
  memberLastName: string; memberFirstName: string; memberMiddleName: string; memberSuffix: string;
  memberDateOfBirth: string; memberGender: 'Male' | 'Female' | '';
  memberPhilhealthNo: string; independentsPhilhealthNo: string;
  philhealthCategory: 'FE-Private' | 'FE-Government' | 'IE' | 'Others' | '';
  pcbEligible: 'YES' | 'NO' | ''; pcbDateOfEnlistment: string;
  notes: string;
}

const emptyPatient = (): PatientInfo => ({
  lastName: '', firstName: '', middleName: '', suffix: '', maidenName: '',
  sex: '', dateOfBirth: '', placeOfBirth: '', bloodType: '', religion: '', residentialAddress: '',
  civilStatus: '', spouseName: '',
  educationalAttainment: '', employmentStatus: '', occupation: '',
  familyMemberPosition: '', familyMemberOther: '', patientContactNo: '',
  motherName: '', motherDateOfBirth: '',
  dswdNhts: '', familyHouseholdNumber: '', fourPsMember: '', householdNumber: '',
  philhealthMember: '', philhealthStatusType: '', philhealthRelationship: '',
  memberLastName: '', memberFirstName: '', memberMiddleName: '', memberSuffix: '',
  memberDateOfBirth: '', memberGender: '', memberPhilhealthNo: '', independentsPhilhealthNo: '',
  philhealthCategory: '', pcbEligible: '', pcbDateOfEnlistment: '',
  notes: '',
});

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getRawUnit(m: Medicine): string        { return m.unit ?? m.category ?? ''; }
function getDispensableUnit(m: Medicine): DispensableUnit | null { const r = getRawUnit(m).trim(); return r || null; }
function getEffectiveStock(m: Medicine): number { if (m.quantity !== undefined) return m.quantity; return Math.max(m.stockPerUnit ?? 0, m.stockPerPieces ?? 0); }
function getMinStock(m: Medicine): number       { return m.minStock ?? 0; }
function getDisplayName(m: Medicine): string    { return m.baseName || m.name || '—'; }
function getDisplayDescription(m: Medicine): string { return m.description || ''; }
function getDisplayBrand(m: Medicine): string   { return m.brandModel || m.brand || ''; }

function getMedicineStatus(medicine: Medicine) {
  const stock = getEffectiveStock(medicine);
  const minStock = getMinStock(medicine);
  const exp = medicine.expirationDate ? new Date(medicine.expirationDate) : null;
  const now = new Date();
  if (stock === 0)      return { label: 'Out of Stock', variant: 'out'      as const };
  if (exp && exp < now) return { label: 'Expired',      variant: 'expired'  as const };
  if (exp) { const days = Math.floor((exp.getTime() - now.getTime()) / 86400000); if (days <= 30) return { label: `Exp. ${days}d`, variant: 'expiring' as const }; }
  if (minStock > 0 && stock <= minStock) return { label: 'Low Stock', variant: 'low' as const };
  return { label: 'In Stock', variant: 'in' as const };
}

function getConversionLabel(m: Medicine): string | null {
  const pcsPerUnit = m.unitConversion?.conversionFactor;
  const containerQty = m.containerQuantity;
  const originalUnit = m.originalUnit;
  if (!pcsPerUnit || !containerQty || !originalUnit) return null;
  return `${pcsPerUnit}pcs/${containerQty} ${originalUnit}`;
}

function getExpirationDisplay(expirationDate?: string): string | null {
  if (!expirationDate) return null;
  const exp = new Date(expirationDate);
  const now = new Date();
  const days = Math.floor((exp.getTime() - now.getTime()) / 86400000);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  if (days <= 30) return `Expires in ${days}d`;
  return exp.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusStyles: Record<string, string> = {
  out:      'bg-slate-100 text-slate-500 border-slate-200',
  expired:  'bg-red-50 text-red-600 border-red-200',
  expiring: 'bg-amber-50 text-amber-600 border-amber-200',
  low:      'bg-yellow-50 text-yellow-700 border-yellow-200',
  in:       'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const statusConfig: Record<string, { dot: string; text: string; bg: string }> = {
  out:      { dot: 'bg-slate-400',   text: 'text-slate-500',  bg: 'bg-slate-100' },
  expired:  { dot: 'bg-red-500',     text: 'text-red-600',    bg: 'bg-red-50' },
  expiring: { dot: 'bg-amber-500',   text: 'text-amber-600',  bg: 'bg-amber-50' },
  low:      { dot: 'bg-yellow-500',  text: 'text-yellow-700', bg: 'bg-yellow-50' },
  in:       { dot: 'bg-emerald-500', text: 'text-emerald-700',bg: 'bg-emerald-50' },
};

const unitColorPalettes = [
  { badge: 'bg-blue-50 text-blue-700 border-blue-200',       btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  { badge: 'bg-violet-50 text-violet-700 border-violet-200', btn: 'bg-violet-600 hover:bg-violet-700 text-white' },
  { badge: 'bg-teal-50 text-teal-700 border-teal-200',       btn: 'bg-teal-600 hover:bg-teal-700 text-white' },
  { badge: 'bg-amber-50 text-amber-700 border-amber-200',    btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
  { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', btn: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  { badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',       btn: 'bg-cyan-600 hover:bg-cyan-700 text-white' },
  { badge: 'bg-pink-50 text-pink-700 border-pink-200',       btn: 'bg-pink-600 hover:bg-pink-700 text-white' },
  { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
];
const getUnitStyles = (unit: string) => {
  const hash = unit.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0);
  return unitColorPalettes[Math.abs(hash) % unitColorPalettes.length];
};

// ─── Reusable form atoms ───────────────────────────────────────────────────────
const FLabel = ({ children, required, xl }: { children: React.ReactNode; required?: boolean; xl?: boolean }) => (
  <label className={`block font-semibold text-slate-500 uppercase tracking-wide mb-1.5 ${xl ? 'text-xs' : 'text-[10px]'}`}>
    {children}{required && <span className="text-red-400 ml-0.5">*</span>}
  </label>
);

const FInput = ({ value, onChange, placeholder, type = 'text', className = '', xl }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; xl?: boolean;
}) => (
  <input
    type={type} placeholder={placeholder} value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`w-full bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-slate-800 placeholder:text-slate-400 ${
      xl ? 'px-4 py-3 text-sm' : 'px-2.5 py-2 text-xs'
    } ${className}`}
  />
);

const FSelect = ({ value, onChange, options, placeholder, className = '', xl }: {
  value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[]; placeholder?: string; className?: string; xl?: boolean;
}) => (
  <select value={value} onChange={(e) => onChange(e.target.value)}
    className={`w-full bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition ${
      xl ? 'px-4 py-3 text-sm' : 'px-2.5 py-2 text-xs'
    } ${className}`}>
    <option value="">{placeholder ?? 'Select…'}</option>
    {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);

const FPills = ({ value, onChange, options, xl }: {
  value: string; onChange: (v: string) => void;
  options: { label: string; value: string }[];
  xl?: boolean;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((o) => (
      <button key={o.value} type="button"
        onClick={() => onChange(value === o.value ? '' : o.value)}
        className={`font-semibold rounded-full border transition-all ${
          xl ? 'px-4 py-1.5 text-xs' : 'px-2.5 py-1 text-[10px]'
        } ${
          value === o.value
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600'
        }`}>
        {o.label}
      </button>
    ))}
  </div>
);

const FSectionTitle = ({ children, xl }: { children: React.ReactNode; xl?: boolean }) => (
  <div className={`flex items-center gap-2 ${xl ? 'mt-6 mb-4' : 'mt-4 mb-3'}`}>
    <span className={`font-bold uppercase tracking-widest text-blue-600 ${xl ? 'text-[10px]' : 'text-[9px]'}`}>{children}</span>
    <div className="flex-1 h-px bg-blue-100" />
  </div>
);

// ─── PatientSelector Component ─────────────────────────────────────────────────
interface PatientSelectorProps {
  patients: PatientRecord[];
  selectedPatientId: string;
  onSelectPatient?: (patientId: string) => void;
  isLoadingPatients: boolean;
  xl?: boolean;
  onClearForm?: () => void;
}

function PatientSelector({ patients, selectedPatientId, onSelectPatient, isLoadingPatients, xl = false, onClearForm }: PatientSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase();
    return patients.filter((p) => getPatientDisplayName(p).toLowerCase().includes(term));
  }, [patients, searchTerm]);

  const selectedName = useMemo(() => {
    const patient = patients.find((p) => p.id === selectedPatientId);
    return patient ? getPatientDisplayName(patient) : '';
  }, [patients, selectedPatientId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`mb-4 pb-4 border-b border-slate-200 relative`} ref={dropdownRef}>
      <FLabel required xl={xl}>Select Existing Patient or Enter New</FLabel>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoadingPatients}
          className={`w-full bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-slate-800 placeholder:text-slate-400 text-left flex items-center justify-between ${
            xl ? 'px-4 py-3 text-sm' : 'px-2.5 py-2 text-xs'
          } disabled:opacity-50 ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}>
          <span className={selectedName ? 'text-slate-800' : 'text-slate-400'}>
            {isLoadingPatients ? 'Loading patients...' : selectedName || '+ Add New Patient'}
          </span>
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7-7m0 0L5 14m7-7v12" />
          </svg>
        </button>

        {isOpen && (
          <div className={`absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 ${
            filteredPatients.length > 10 ? 'max-h-64 overflow-y-auto' : ''
          }`}>
            {/* Search input */}
            {patients.length > 0 && (
              <div className="sticky top-0 px-3 py-2 border-b border-slate-100 bg-white rounded-t-xl">
                <input
                  type="text"
                  placeholder="Search patients..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 ${
                    xl ? 'px-3 py-2 text-sm' : 'px-2 py-1.5 text-xs'
                  }`}
                />
              </div>
            )}

            {/* Options */}
            {filteredPatients.length === 0 && searchTerm && (
              <div className={`px-3 py-2 text-slate-400 text-center ${xl ? 'text-sm' : 'text-xs'}`}>
                No patients found
              </div>
            )}

            {filteredPatients.length > 0 && (
              <>
                {filteredPatients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      onSelectPatient?.(patient.id || '');
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 ${
                      selectedPatientId === patient.id ? 'bg-blue-100 font-semibold text-blue-900' : 'text-slate-700'
                    } ${xl ? 'text-sm' : 'text-xs'}`}>
                    <span className="font-medium">{getPatientDisplayName(patient)}</span>
                  </button>
                ))}
              </>
            )}

            {/* New patient option */}
            <button
              type="button"
              onClick={() => {
                onSelectPatient?.('');
                onClearForm?.();
                setIsOpen(false);
                setSearchTerm('');
              }}
              className={`w-full text-left px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors border-t border-slate-100 text-blue-600 font-semibold ${
                !selectedPatientId ? 'bg-blue-50' : ''
              } ${xl ? 'text-sm' : 'text-xs'}`}>
              + Add New Patient
            </button>
          </div>
        )}
      </div>

      {patients.length === 0 && !isLoadingPatients && (
        <p className="text-[10px] text-slate-400 mt-1">No previous patients found. Enter a new patient below.</p>
      )}
    </div>
  );
}

// ─── PatientForm ───────────────────────────────────────────────────────────────
interface PatientFormProps {
  patientInfo: PatientInfo;
  onChange: <K extends keyof PatientInfo>(key: K, value: PatientInfo[K]) => void;
  expanded?: boolean;
  canDispense: boolean;
  dispensCount: number;
  onConfirm: () => void;
  onBack: () => void;
  patients?: PatientRecord[];
  isLoadingPatients?: boolean;
  selectedPatientId?: string;
  onSelectPatient?: (patientId: string) => void;
  onClearForm?: () => void;
}

function PatientForm({ patientInfo, onChange, expanded = false, canDispense, dispensCount, onConfirm, onBack, patients = [], isLoadingPatients = false, selectedPatientId = '', onSelectPatient, onClearForm }: PatientFormProps) {
  const col2 = expanded ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2';
  const xl = expanded;

  return (
    <div className={`space-y-1 ${xl ? 'text-sm' : 'text-xs'}`}>
      {/* Patient Selector Dropdown */}
      <PatientSelector 
        patients={patients}
        selectedPatientId={selectedPatientId}
        onSelectPatient={onSelectPatient}
        isLoadingPatients={isLoadingPatients}
        xl={xl}
        onClearForm={onClearForm}
      />

      {/* Clear Form Button */}
      {selectedPatientId && (
        <button
          type="button"
          onClick={() => {
            onSelectPatient?.('');
            onClearForm?.();
          }}
          className={`w-full py-2 mb-4 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-xl transition-colors`}>
          Clear Form
        </button>
      )}

      <FSectionTitle xl={xl}>I. Patient Information</FSectionTitle>
      <div className={`grid ${col2} gap-3`}>
        <div><FLabel required xl={xl}>Last Name</FLabel><FInput xl={xl} value={patientInfo.lastName} onChange={(v) => onChange('lastName', v)} placeholder="Apelyido" /></div>
        <div><FLabel required xl={xl}>First Name</FLabel><FInput xl={xl} value={patientInfo.firstName} onChange={(v) => onChange('firstName', v)} placeholder="Pangalan" /></div>
        {expanded && <div><FLabel xl={xl}>Middle Name</FLabel><FInput xl={xl} value={patientInfo.middleName} onChange={(v) => onChange('middleName', v)} placeholder="Gitnang Pangalan" /></div>}
      </div>
      {!expanded && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div><FLabel>Middle Name</FLabel><FInput value={patientInfo.middleName} onChange={(v) => onChange('middleName', v)} placeholder="Gitnang Pangalan" /></div>
          <div><FLabel>Suffix</FLabel><FSelect value={patientInfo.suffix} onChange={(v) => onChange('suffix', v)} options={[{ label: 'Jr.', value: 'Jr.' }, { label: 'Sr.', value: 'Sr.' }, { label: 'II', value: 'II' }, { label: 'III', value: 'III' }, { label: 'IV', value: 'IV' }]} placeholder="e.g. Jr., Sr." /></div>
        </div>
      )}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div><FLabel xl={xl}>Suffix</FLabel><FSelect xl={xl} value={patientInfo.suffix} onChange={(v) => onChange('suffix', v)} options={[{ label: 'Jr.', value: 'Jr.' }, { label: 'Sr.', value: 'Sr.' }, { label: 'II', value: 'II' }, { label: 'III', value: 'III' }, { label: 'IV', value: 'IV' }]} placeholder="e.g. Jr., Sr." /></div>
          <div><FLabel xl={xl}>Maiden Name <span className="normal-case font-normal text-slate-400">(for married women only)</span></FLabel><FInput xl={xl} value={patientInfo.maidenName} onChange={(v) => onChange('maidenName', v)} placeholder="Pangalan sa pagkadalaga" /></div>
        </div>
      )}
      {!expanded && <div className="mt-2"><FLabel>Maiden Name <span className="normal-case font-normal text-slate-400">(for married women only)</span></FLabel><FInput value={patientInfo.maidenName} onChange={(v) => onChange('maidenName', v)} placeholder="Pangalan sa pagkadalaga" /></div>}
      <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Sex (Kasarian)</FLabel><FPills xl={xl} value={patientInfo.sex} onChange={(v) => onChange('sex', v as PatientInfo['sex'])} options={[{ label: 'Male (Lalaki)', value: 'Male' }, { label: 'Female (Babae)', value: 'Female' }]} /></div>
      <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
        <div><FLabel xl={xl}>Date of Birth</FLabel><FInput xl={xl} value={patientInfo.dateOfBirth} onChange={(v) => onChange('dateOfBirth', v)} placeholder="mm/dd/yyyy" /></div>
        <div><FLabel xl={xl}>Place of Birth</FLabel><FInput xl={xl} value={patientInfo.placeOfBirth} onChange={(v) => onChange('placeOfBirth', v)} placeholder="City/Municipality" /></div>
      </div>
      <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
        <div><FLabel xl={xl}>Blood Type (Rh+/-)</FLabel><FSelect xl={xl} value={patientInfo.bloodType} onChange={(v) => onChange('bloodType', v)} options={['A+','A-','B+','B-','O+','O-','AB+','AB-'].map((b) => ({ label: b, value: b }))} placeholder="Select…" /></div>
        <div><FLabel xl={xl}>Religion</FLabel><FInput xl={xl} value={patientInfo.religion} onChange={(v) => onChange('religion', v)} placeholder="Relihiyon" /></div>
      </div>
      <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Residential Address</FLabel><FInput xl={xl} value={patientInfo.residentialAddress} onChange={(v) => onChange('residentialAddress', v)} placeholder="Complete address" /></div>
      <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Civil Status (Katayuang Sibil)</FLabel><FPills xl={xl} value={patientInfo.civilStatus} onChange={(v) => onChange('civilStatus', v as PatientInfo['civilStatus'])} options={[{ label: 'Single', value: 'Single' }, { label: 'Married', value: 'Married' }, { label: 'Widow', value: 'Widow' }, { label: 'Separated', value: 'Separated' }, { label: 'Annulled', value: 'Annulled' }, { label: 'Co-Habitation', value: 'Co-Habitation' }]} /></div>
      {(patientInfo.civilStatus === 'Married' || patientInfo.civilStatus === 'Co-Habitation') && <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Spouse Name</FLabel><FInput xl={xl} value={patientInfo.spouseName} onChange={(v) => onChange('spouseName', v)} placeholder="Full name of spouse" /></div>}
      <FSectionTitle xl={xl}>Education &amp; Employment</FSectionTitle>
      <div><FLabel xl={xl}>Educational Attainment</FLabel><FPills xl={xl} value={patientInfo.educationalAttainment} onChange={(v) => onChange('educationalAttainment', v as PatientInfo['educationalAttainment'])} options={[{ label: 'No Formal', value: 'No Formal Education' }, { label: 'Elementary', value: 'Elementary' }, { label: 'High School', value: 'High School' }, { label: 'Vocational', value: 'Vocational' }, { label: 'College', value: 'College' }, { label: 'Post Grad', value: 'Post Graduate' }]} /></div>
      <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Employment Status</FLabel><FPills xl={xl} value={patientInfo.employmentStatus} onChange={(v) => onChange('employmentStatus', v as PatientInfo['employmentStatus'])} options={[{ label: 'Student', value: 'Student' }, { label: 'Employed', value: 'Employed' }, { label: 'Retired', value: 'Retired' }, { label: 'Unemployed', value: 'Unemployed' }, { label: 'Unknown', value: 'Unknown' }]} /></div>
      {patientInfo.employmentStatus === 'Employed' && <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Occupation</FLabel><FInput xl={xl} value={patientInfo.occupation} onChange={(v) => onChange('occupation', v)} placeholder="Specify occupation" /></div>}
      <FSectionTitle xl={xl}>Family</FSectionTitle>
      <div>
        <FLabel xl={xl}>Family Member Position (Posisyon sa Pamilya)</FLabel>
        <FPills xl={xl} value={patientInfo.familyMemberPosition} onChange={(v) => onChange('familyMemberPosition', v as PatientInfo['familyMemberPosition'])} options={[{ label: 'Father', value: 'Father' }, { label: 'Mother', value: 'Mother' }, { label: 'Son', value: 'Son' }, { label: 'Daughter', value: 'Daughter' }, { label: 'Others', value: 'Others' }]} />
        {patientInfo.familyMemberPosition === 'Others' && <div className="mt-2"><FInput xl={xl} value={patientInfo.familyMemberOther} onChange={(v) => onChange('familyMemberOther', v)} placeholder="Specify…" /></div>}
      </div>
      <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
        <div><FLabel required xl={xl}>Patient Contact No.</FLabel><FInput xl={xl} value={patientInfo.patientContactNo} onChange={(v) => onChange('patientContactNo', v)} placeholder="09XXXXXXXXX" type="tel" /></div>
        <div><FLabel xl={xl}>Mother&apos;s Name</FLabel><FInput xl={xl} value={patientInfo.motherName} onChange={(v) => onChange('motherName', v)} placeholder="Full name" /></div>
      </div>
      <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>Mother&apos;s Date of Birth</FLabel><FInput xl={xl} value={patientInfo.motherDateOfBirth} onChange={(v) => onChange('motherDateOfBirth', v)} placeholder="mm/dd/yyyy" /></div>
      <FSectionTitle xl={xl}>DSWD / Household</FSectionTitle>
      <div className={`grid ${col2} gap-3`}>
        <div><FLabel xl={xl}>DSWD NHTS?</FLabel><FPills xl={xl} value={patientInfo.dswdNhts} onChange={(v) => onChange('dswdNhts', v as 'YES' | 'NO' | '')} options={[{ label: 'YES', value: 'YES' }, { label: 'NO', value: 'NO' }]} /></div>
        <div><FLabel xl={xl}>Family Household Number</FLabel><FInput xl={xl} value={patientInfo.familyHouseholdNumber} onChange={(v) => onChange('familyHouseholdNumber', v)} placeholder="Number" /></div>
      </div>
      <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
        <div><FLabel xl={xl}>4P&apos;s Member?</FLabel><FPills xl={xl} value={patientInfo.fourPsMember} onChange={(v) => onChange('fourPsMember', v as 'YES' | 'NO' | '')} options={[{ label: 'YES', value: 'YES' }, { label: 'NO', value: 'NO' }]} /></div>
        <div><FLabel xl={xl}>Household Number</FLabel><FInput xl={xl} value={patientInfo.householdNumber} onChange={(v) => onChange('householdNumber', v)} placeholder="Number" /></div>
      </div>
      <FSectionTitle xl={xl}>PhilHealth</FSectionTitle>
      <div><FLabel xl={xl}>PhilHealth Member?</FLabel><FPills xl={xl} value={patientInfo.philhealthMember} onChange={(v) => onChange('philhealthMember', v as 'YES' | 'NO' | '')} options={[{ label: 'YES', value: 'YES' }, { label: 'NO', value: 'NO' }]} /></div>
      {patientInfo.philhealthMember === 'YES' && (
        <>
          <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
            <div><FLabel xl={xl}>Status Type</FLabel><FPills xl={xl} value={patientInfo.philhealthStatusType} onChange={(v) => onChange('philhealthStatusType', v as PatientInfo['philhealthStatusType'])} options={[{ label: 'Member', value: 'Member' }, { label: 'Dependent', value: 'Dependent' }]} /></div>
            <div><FLabel xl={xl}>Relationship to Member</FLabel><FPills xl={xl} value={patientInfo.philhealthRelationship} onChange={(v) => onChange('philhealthRelationship', v as PatientInfo['philhealthRelationship'])} options={[{ label: 'Child', value: 'Child' }, { label: 'Parent', value: 'Parent' }, { label: 'Spouse', value: 'Spouse' }]} /></div>
          </div>
          <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
            <div><FLabel xl={xl}>Member&apos;s Last Name</FLabel><FInput xl={xl} value={patientInfo.memberLastName} onChange={(v) => onChange('memberLastName', v)} placeholder="Last name" /></div>
            <div><FLabel xl={xl}>Member&apos;s First Name</FLabel><FInput xl={xl} value={patientInfo.memberFirstName} onChange={(v) => onChange('memberFirstName', v)} placeholder="First name" /></div>
          </div>
          <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
            <div><FLabel xl={xl}>Member&apos;s Middle Name</FLabel><FInput xl={xl} value={patientInfo.memberMiddleName} onChange={(v) => onChange('memberMiddleName', v)} placeholder="Middle name" /></div>
            <div><FLabel xl={xl}>Member&apos;s Suffix</FLabel><FSelect xl={xl} value={patientInfo.memberSuffix} onChange={(v) => onChange('memberSuffix', v)} options={['Jr.','Sr.','II','III','IV'].map((s) => ({ label: s, value: s }))} placeholder="e.g. Jr." /></div>
          </div>
          <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
            <div><FLabel xl={xl}>Member&apos;s Date of Birth</FLabel><FInput xl={xl} value={patientInfo.memberDateOfBirth} onChange={(v) => onChange('memberDateOfBirth', v)} placeholder="mm/dd/yyyy" /></div>
            <div><FLabel xl={xl}>Member&apos;s Gender</FLabel><FPills xl={xl} value={patientInfo.memberGender} onChange={(v) => onChange('memberGender', v as 'Male' | 'Female' | '')} options={[{ label: 'Male', value: 'Male' }, { label: 'Female', value: 'Female' }]} /></div>
          </div>
          <div className={`grid ${col2} gap-3 ${xl ? 'mt-4' : 'mt-2'}`}>
            <div><FLabel xl={xl}>Member&apos;s PhilHealth No.</FLabel><FInput xl={xl} value={patientInfo.memberPhilhealthNo} onChange={(v) => onChange('memberPhilhealthNo', v)} placeholder="PhilHealth number" /></div>
            <div><FLabel xl={xl}>Independents PhilHealth No.</FLabel><FInput xl={xl} value={patientInfo.independentsPhilhealthNo} onChange={(v) => onChange('independentsPhilhealthNo', v)} placeholder="Independents no." /></div>
          </div>
          <div className={xl ? 'mt-4' : 'mt-2'}><FLabel xl={xl}>PhilHealth Category</FLabel><FPills xl={xl} value={patientInfo.philhealthCategory} onChange={(v) => onChange('philhealthCategory', v as PatientInfo['philhealthCategory'])} options={[{ label: 'FE – Private', value: 'FE-Private' }, { label: 'FE – Government', value: 'FE-Government' }, { label: 'IE', value: 'IE' }, { label: 'Others', value: 'Others' }]} /></div>
        </>
      )}
      <FSectionTitle xl={xl}>PCB Eligibility</FSectionTitle>
      <div className={`grid ${xl ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'} gap-3`}>
        <div><FLabel xl={xl}>PCB Eligible?</FLabel><FPills xl={xl} value={patientInfo.pcbEligible} onChange={(v) => onChange('pcbEligible', v as 'YES' | 'NO' | '')} options={[{ label: 'YES', value: 'YES' }, { label: 'NO', value: 'NO' }]} /></div>
        {patientInfo.pcbEligible === 'YES' && <div><FLabel xl={xl}>Date of Enlistment</FLabel><FInput xl={xl} value={patientInfo.pcbDateOfEnlistment} onChange={(v) => onChange('pcbDateOfEnlistment', v)} placeholder="mm/dd/yyyy" /></div>}
      </div>
      <div className={xl ? 'mt-5' : 'mt-3'}>
        <FLabel xl={xl}>Notes / Special Instructions</FLabel>
        <textarea placeholder="Additional notes…" value={patientInfo.notes} onChange={(e) => onChange('notes', e.target.value)} rows={xl ? 3 : 2}
          className={`w-full bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none text-slate-800 placeholder:text-slate-400 ${xl ? 'px-4 py-3 text-sm' : 'px-2.5 py-2 text-xs'}`} />
      </div>
      {!expanded && (
        <div className="pt-3 space-y-2">
          <button onClick={onConfirm} disabled={!canDispense}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${canDispense ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
            {canDispense ? `Dispense ${dispensCount} Item${dispensCount !== 1 ? 's' : ''}` : 'Fill required fields (First & Last Name)'}
          </button>
          <button onClick={onBack} className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors">← Back to medicines</button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────────────────
export default function DispensePage() {
  const { user, role, loading, staffName, adminName } = useAuth();
  // isCollapsed is used for layout awareness but not directly referenced in JSX classes here
  const { isCollapsed } = useSidebar();
  const router = useRouter();

  const [medicines,          setMedicines]         = useState<Medicine[]>([]);
  const [isLoadingMedicines, setIsLoadingMedicines]= useState(true);
  const [searchTerm,         setSearchTerm]        = useState('');
  const [dispensList,        setDispenseList]      = useState<DispenseItem[]>([]);
  const [notification,       setNotification]      = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal,   setShowConfirmModal]  = useState(false);
  const [isProcessing,       setIsProcessing]      = useState(false);
  const [filterUnit,         setFilterUnit]        = useState<'all' | DispensableUnit>('all');
  const [filterStock,        setFilterStock]       = useState<'all' | 'in' | 'low' | 'expiring' | 'expired' | 'out'>('all');
  const [filterAgeGroup,     setFilterAgeGroup]    = useState<'all' | string>('all');
  const [availableAgeGroups, setAvailableAgeGroups]= useState<string[]>([]);
  const [patientInfo,        setPatientInfo]       = useState<PatientInfo>(emptyPatient());
  const [activeStep,         setActiveStep]        = useState<1 | 2>(1);
  const [isPanelMinimized,   setIsPanelMinimized]  = useState(false);
  const [isPatientExpanded,  setIsPatientExpanded] = useState(false);
  const [viewMode,           setViewMode]          = useState<'grid' | 'table'>('grid');
  const [availableUnits,     setAvailableUnits]    = useState<DispensableUnit[]>([]);
  const [medicineModalOpen,  setMedicineModalOpen] = useState(false);
  const [selectedBaseName,   setSelectedBaseName]  = useState<string>('');
  const [availableStrengths, setAvailableStrengths]= useState<Array<{ strength: string | undefined; medicine: Medicine }>>([]);
  const [quickSelectBaseName,setQuickSelectBaseName]=useState<string>('');
  const [quickSelectStrength,setQuickSelectStrength]=useState<string>('');
  const [qtyInputs, setQtyInputs] = useState<Record<number, string>>({});
  const [patients,           setPatients]          = useState<PatientRecord[]>([]);
  const [isLoadingPatients,  setIsLoadingPatients] = useState(true);
  const [selectedPatientId,  setSelectedPatientId] = useState<string>('');

  // Suppress unused warning — isCollapsed is intentionally kept for potential future layout use
  void isCollapsed;

  const handlePatientChange = useCallback(<K extends keyof PatientInfo>(key: K, value: PatientInfo[K]) => {
    setPatientInfo((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSelectPatient = useCallback((patientId: string) => {
    setSelectedPatientId(patientId);
    const patient = patients.find((p) => p.id === patientId);
    if (patient && patient.fullPatientData) {
      setPatientInfo(patient.fullPatientData);
    }
  }, [patients]);

  const handleClearForm = useCallback(() => {
    setPatientInfo(emptyPatient());
    setSelectedPatientId('');
  }, []);

  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(database, getUserPath(user.uid, 'medicines')), (snap) => {
      const data = snap.val();
      setMedicines(data ? Object.entries(data as Record<string, MedicineRecord>).map(([id, v]) => ({ id, ...v })) : []);
      setIsLoadingMedicines(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setIsLoadingPatients(true);
    const unsub = listenToPatients(user.uid, (patients) => {
      setPatients(patients.sort((a, b) => {
        const nameA = getPatientDisplayName(a).toLowerCase();
        const nameB = getPatientDisplayName(b).toLowerCase();
        return nameA.localeCompare(nameB);
      }));
      setIsLoadingPatients(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  const dispensableMedicines = useMemo(() => medicines.filter((m) => getDispensableUnit(m) !== null), [medicines]);

  useEffect(() => {
    const units = new Set<DispensableUnit>();
    medicines.forEach((m) => {
      const u = getDispensableUnit(m);
      if (u) units.add(u);
      if (m.piecesPerUnit && m.piecesPerUnit > 0) units.add('Pieces' as DispensableUnit);
    });
    setAvailableUnits(Array.from(units).sort());
  }, [medicines]);

  useEffect(() => {
    const ageGroups = new Set<string>();
    medicines.forEach((m) => {
      if (m.ageGroup) ageGroups.add(m.ageGroup);
    });
    setAvailableAgeGroups(Array.from(ageGroups).sort());
  }, [medicines]);

  useEffect(() => {
    if (filterUnit !== 'all' && availableUnits.length > 0 && !availableUnits.includes(filterUnit)) setFilterUnit('all');
  }, [availableUnits, filterUnit]);

  const medicinesByBaseName = useMemo(() => {
    const map = new Map<string, Medicine[]>();
    dispensableMedicines.forEach((m) => {
      const key = m.baseName || m.name || '—';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [dispensableMedicines]);

  const uniqueMedicineNames = useMemo(() => Array.from(medicinesByBaseName.keys()).sort(), [medicinesByBaseName]);

  useEffect(() => {
    const baseName = selectedBaseName || quickSelectBaseName;
    if (!baseName) { setAvailableStrengths([]); return; }
    const variants = dispensableMedicines.filter((m) => (m.baseName || m.name) === baseName);
    setAvailableStrengths(variants.map((m) => ({ strength: m.strength || 'Standard', medicine: m })));
  }, [selectedBaseName, quickSelectBaseName, dispensableMedicines]);

  const filteredMedicines = useMemo(() => dispensableMedicines.filter((m) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = [getDisplayName(m), getDisplayDescription(m), getDisplayBrand(m), getRawUnit(m), m.strength ?? ''].some((s) => s.toLowerCase().includes(q));
    return matchSearch
      && (filterUnit === 'all' || getDispensableUnit(m) === filterUnit)
      && (filterStock === 'all' || getMedicineStatus(m).variant === filterStock)
      && (filterAgeGroup === 'all' || m.ageGroup === filterAgeGroup)
      && (!quickSelectBaseName || (m.baseName || m.name) === quickSelectBaseName)
      && (!quickSelectStrength || (m.strength || 'Standard') === quickSelectStrength);
  }), [dispensableMedicines, searchTerm, filterUnit, filterStock, filterAgeGroup, quickSelectBaseName, quickSelectStrength]);

  const syncQtyInput = (list: DispenseItem[]) => {
    const vals: Record<number, string> = {};
    list.forEach((item, i) => { vals[i] = String(item.quantity); });
    setQtyInputs(vals);
  };

  const addMedicineToCart = (medicine: Medicine) => {
    const unit = getDispensableUnit(medicine);
    if (!unit) return;
    const stock = getEffectiveStock(medicine);
    if (stock === 0) { setNotification({ message: `${getDisplayName(medicine)} is out of stock`, type: 'error' }); return; }
    const idx = dispensList.findIndex((d) => d.medicine.id === medicine.id && d.unitType === unit);
    if (idx !== -1) {
      if (dispensList[idx].quantity < stock) {
        const next = dispensList.map((d, i) => i === idx ? { ...d, quantity: d.quantity + 1 } : d);
        setDispenseList(next); syncQtyInput(next);
      } else { setNotification({ message: 'Quantity exceeds available stock', type: 'error' }); }
    } else {
      const next = [...dispensList, { medicine, quantity: 1, unitType: unit, selectedStrength: medicine.strength }];
      setDispenseList(next); syncQtyInput(next);
    }
  };

  const commitQty = (index: number, qty: number) => {
    const item = dispensList[index];
    if (!item) return;
    if (qty <= 0) { const next = dispensList.filter((_, i) => i !== index); setDispenseList(next); syncQtyInput(next); return; }
    const maxStock = getEffectiveStock(item.medicine);
    const clamped = Math.min(qty, maxStock);
    const next = dispensList.map((d, i) => i === index ? { ...d, quantity: clamped } : d);
    setDispenseList(next);
    setQtyInputs((p) => ({ ...p, [index]: String(clamped) }));
  };

  const handleQtyInputChange = (index: number, raw: string) => {
    setQtyInputs((p) => ({ ...p, [index]: raw }));
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 1) commitQty(index, parsed);
  };

  const handleQtyInputBlur = (index: number) => {
    const item = dispensList[index];
    if (!item) return;
    setQtyInputs((p) => {
      const raw = p[index];
      const parsed = parseInt(raw, 10);
      if (!raw || isNaN(parsed) || parsed < 1) return { ...p, [index]: String(item.quantity) };
      return p;
    });
  };

  const removeMedicineFromCart = (index: number) => {
    const next = dispensList.filter((_, i) => i !== index);
    setDispenseList(next); syncQtyInput(next);
  };

  const handleDispense = async () => {
    if (!patientInfo.firstName || !patientInfo.lastName) {
      setNotification({ message: 'Please enter patient first and last name', type: 'error' }); return;
    }
    setShowConfirmModal(false);
    setIsProcessing(true);

    const fullName = [
      patientInfo.lastName,
      [patientInfo.firstName, patientInfo.middleName].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ') + (patientInfo.suffix ? ` ${patientInfo.suffix}` : '');

    const patientId = patientInfo.independentsPhilhealthNo || patientInfo.memberPhilhealthNo || patientInfo.patientContactNo || '';
    const dispensedBy = user?.email || user?.displayName || user?.uid || 'unknown';

    if (!user) {
      setNotification({ message: 'Authentication error. Please re-login.', type: 'error' });
      setIsProcessing(false);
      return;
    }

    try {
      const dispensingsPath = getUserPath(user.uid, 'dispensings');
      const dispensRef = push(ref(database, dispensingsPath));
      const dispensId = dispensRef.key;
      if (!dispensId) throw new Error('Failed to generate dispense ID');

      await set(dispensRef, {
        date: new Date().toISOString(),
        patientName: fullName,
        patientId,
        age: patientInfo.dateOfBirth || '',
        notes: patientInfo.notes || '',
        patientInfo,
        items: dispensList.map((item) => ({
          medicineId: item.medicine.id,
          medicineName: getDisplayName(item.medicine),
          medicineDescription: getDisplayDescription(item.medicine),
          brand: getDisplayBrand(item.medicine),
          quantity: item.quantity,
          unitType: item.unitType,
          quantityType: item.unitType,
          selectedStrength: item.selectedStrength || null,
          prescriptionRequired: item.medicine.prescriptionRequired || false,
          piecesPerUnit: item.medicine.piecesPerUnit ?? null,
          stockBeforeDispense: getEffectiveStock(item.medicine),
          expirationDate: item.medicine.expirationDate || null,
          minStock: item.medicine.minStock ?? null,
        })),
        dispensedBy,
        userId: user.uid,
      });

      // Save patient record for future reference
      await savePatientRecord(user.uid, patientInfo);

      const deductResult = await deductStockBatch(
        dispensList.map((item) => ({
          medicineId: item.medicine.id,
          quantity: item.quantity,
          type: 'dispense' as const,
          referenceId: dispensId,
          userId: user.uid,
        })),
        dispensId,
      );

      if (!deductResult.success) throw new Error(deductResult.error || 'Failed to deduct stock');

      // Log activity for each medicine dispensed
      for (let i = 0; i < dispensList.length; i++) {
        const item = dispensList[i];
        const stockResult = deductResult.results[i];
        const stockBefore = getEffectiveStock(item.medicine);
        const stockAfter = stockResult.newStock;

        // Log medicine dispensed activity
        await logActivity(
          'medicine_dispensed',
          user.uid,
          user.email || '',
          `Dispensed ${item.quantity} ${item.unitType} of ${getDisplayName(item.medicine)} to patient ${fullName}`,
          {
            medicineId: item.medicine.id,
            medicineName: getDisplayName(item.medicine),
            quantity: item.quantity,
            unitType: item.unitType,
            patientName: fullName,
            patientId,
            dispensId,
          },
          staffName || adminName || user.email || undefined,
          role || undefined,
        );

        // Log stock deduction activity
        await logActivity(
          'stock_deducted',
          user.uid,
          user.email || '',
          `Stock deducted for ${getDisplayName(item.medicine)}: ${stockBefore} → ${stockAfter} (${item.quantity} units)`,
          {
            medicineId: item.medicine.id,
            medicineName: getDisplayName(item.medicine),
            quantity: item.quantity,
            previousValue: stockBefore,
            newValue: stockAfter,
            reason: `Dispensed to patient ${fullName}`,
            dispensId,
          },
          staffName || adminName || user.email || undefined,
          role || undefined,
        );
      }

      setNotification({ message: 'Medicines dispensed successfully!', type: 'success' });
      setDispenseList([]); setQtyInputs({}); setPatientInfo(emptyPatient()); setSelectedPatientId(''); setActiveStep(1);
    } catch (err) {
      setNotification({ message: `Error: ${err instanceof Error ? err.message : 'Failed'}`, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const canDispense = dispensList.length > 0 && !!patientInfo.firstName && !!patientInfo.lastName;

  const renderCartItem = (item: DispenseItem, idx: number) => {
    const maxStock = getEffectiveStock(item.medicine);
    const rawInput = qtyInputs[idx] ?? String(item.quantity);

    return (
      <div key={idx} className="px-4 py-3.5 group hover:bg-slate-50/80 transition-colors border-b border-slate-100 last:border-0">
        <div className="flex gap-3 items-center">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 text-base">
            {item.medicine.image
              ? <Image src={item.medicine.image} alt="" width={40} height={40} className="object-cover" unoptimized />
              : '💊'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-slate-900 text-xs leading-tight truncate">{getDisplayName(item.medicine)}</p>
              <button onClick={() => removeMedicineFromCart(idx)} className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-0.5 rounded"><X size={14} /></button>
            </div>
            {item.medicine.strength && <p className="text-[10px] text-slate-400 mt-0.5">{item.medicine.strength}</p>}
            <div className="mt-1">
              <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getUnitStyles(item.unitType).badge}`}>{item.unitType}</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 shrink-0 pl-3 border-l border-slate-100">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Qty</span>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg px-1 py-0.5">
              <button className="qty-btn text-slate-600 hover:bg-white hover:text-slate-900" onClick={() => commitQty(idx, item.quantity - 1)}><Minus size={12} strokeWidth={2.5} /></button>
              <input type="number" className="cart-qty-input" value={rawInput} min={1} max={maxStock}
                onChange={e => handleQtyInputChange(idx, e.target.value)}
                onFocus={e => e.target.select()}
                onBlur={() => handleQtyInputBlur(idx)} />
              <button className="qty-btn text-slate-600 hover:bg-white hover:text-slate-900" onClick={() => commitQty(idx, item.quantity + 1)}><Plus size={12} strokeWidth={2.5} /></button>
            </div>
            <span className={`text-[9px] font-semibold ${item.quantity >= maxStock ? 'text-red-500' : 'text-slate-400'}`}>max: {maxStock}</span>
          </div>
        </div>
      </div>
    );
  };

  const activeFilterCount = [
    filterStock !== 'all',
    filterUnit !== 'all',
    filterAgeGroup !== 'all',
    !!quickSelectBaseName,
    !!quickSelectStrength,
  ].filter(Boolean).length;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');
        .dispense-root    { font-family:'DM Sans',sans-serif; }
        .dispense-heading { font-family:'Syne',sans-serif; }
        @keyframes slideUp      { from{opacity:0;transform:translateY(16px);}  to{opacity:1;transform:translateY(0);} }
        @keyframes fadeIn       { from{opacity:0;}                              to{opacity:1;} }
        @keyframes toastIn      { from{opacity:0;transform:translateX(100%);}  to{opacity:1;transform:translateX(0);} }
        @keyframes pulse-dot    { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.4);opacity:0.7;} }
        @keyframes panelSlideIn { from{opacity:0;transform:translateX(40px) scaleX(0.9);} to{opacity:1;transform:translateX(0) scaleX(1);} }
        @keyframes fabIn        { from{opacity:0;transform:scale(0.7) translateY(12px);} to{opacity:1;transform:scale(1) translateY(0);} }
        @keyframes gridExpand   { from{opacity:0.6;transform:scaleX(0.98);} to{opacity:1;transform:scaleX(1);} }
        @keyframes expandIn     { from{opacity:0;transform:scale(0.96);}      to{opacity:1;transform:scale(1);} }
        .medicine-grid   { animation:gridExpand 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .panel-expanded  { animation:panelSlideIn 0.35s cubic-bezier(0.22,1,0.36,1) both; transform-origin:right top; }
        .fab-in          { animation:fabIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        .expand-in       { animation:expandIn 0.25s cubic-bezier(0.22,1,0.36,1) both; }
        .fab-btn         { transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.2s ease; box-shadow:0 4px 20px rgba(0,0,0,0.15),0 1px 4px rgba(0,0,0,0.08); }
        .fab-btn:hover   { transform:scale(1.06) translateY(-2px); box-shadow:0 8px 28px rgba(0,0,0,0.18),0 2px 8px rgba(0,0,0,0.1); }
        .fab-btn:active  { transform:scale(0.97); }
        .minimize-btn    { transition:background 0.15s ease,color 0.15s ease,transform 0.15s ease; }
        .minimize-btn:hover { background:#f1f5f9;color:#475569;transform:scale(1.1); }
        .expand-btn      { transition:all 0.15s ease; }
        .expand-btn:hover { background:#eff6ff;color:#2563eb; }
        .slide-up        { animation:slideUp 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .fade-in         { animation:fadeIn 0.3s ease both; }
        .toast-in        { animation:toastIn 0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .medicine-card   { transition:transform 0.2s ease,box-shadow 0.2s ease; }
        .medicine-card:hover { transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.08); }
        .medicine-card.in-cart { border-color:#3b82f6 !important; box-shadow:0 0 0 3px rgba(59,130,246,0.12), 0 4px 16px -2px rgba(59,130,246,0.15); }
        .add-btn         { transition:all 0.15s ease; }
        .add-btn:hover:not(:disabled) { filter:brightness(1.08);transform:scale(1.02); }
        .add-btn:active:not(:disabled){ transform:scale(0.98); }
        .scroll-area::-webkit-scrollbar       { width:4px; }
        .scroll-area::-webkit-scrollbar-track { background:transparent; }
        .scroll-area::-webkit-scrollbar-thumb { background:#e2e8f0;border-radius:99px; }
        .scroll-area::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }
        .step-tab        { position:relative;transition:color 0.2s ease; }
        .step-tab::after { content:'';position:absolute;bottom:-1px;left:0;right:0;height:2px;background:#2563eb;border-radius:99px;transform:scaleX(0);transition:transform 0.25s cubic-bezier(0.22,1,0.36,1); }
        .step-tab.active::after { transform:scaleX(1); }
        .step-tab.active { color:#2563eb; }
        .filter-chip     { transition:all 0.15s ease;cursor:pointer; }
        .filter-chip:hover  { background:#e2e8f0; }
        .filter-chip.active { background:#1e40af;color:white;border-color:transparent; }
        .qty-btn { width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:background 0.15s,color 0.15s,transform 0.1s;flex-shrink:0; }
        .qty-btn:hover { transform:scale(1.12); }
        .qty-btn:active { transform:scale(0.94); }
        .cart-qty-input { width:64px;text-align:center;font-size:14px;font-weight:700;color:#0f172a;background:white;border:1.5px solid #cbd5e1;border-radius:8px;padding:5px 6px;outline:none;transition:border-color 0.15s,box-shadow 0.15s;font-family:'DM Mono',monospace;-moz-appearance:textfield; }
        .cart-qty-input:focus { border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,0.18); }
        .cart-qty-input::-webkit-inner-spin-button,.cart-qty-input::-webkit-outer-spin-button { -webkit-appearance:none;margin:0; }
        .search-bar-wrap { position:relative; }
        .search-bar-input { width:100%;padding:10px 40px 10px 38px;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;font-size:13.5px;color:#1e293b;outline:none;transition:border-color 0.15s,background 0.15s,box-shadow 0.15s;font-family:'DM Sans',sans-serif; }
        .search-bar-input::placeholder { color:#94a3b8; }
        .search-bar-input:focus { border-color:#3b82f6;background:#fff;box-shadow:0 0 0 3px rgba(59,130,246,0.12); }
        .search-bar-input.has-value { border-color:#bfdbfe;background:#eff6ff; }
        .search-icon { position:absolute;left:12px;top:50%;transform:translateY(-50%);pointer-events:none;color:#94a3b8;transition:color 0.15s; }
        .search-bar-input:focus ~ .search-icon,.search-bar-wrap:focus-within .search-icon { color:#3b82f6; }
        .search-clear-btn { position:absolute;right:10px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;background:#e2e8f0;color:#64748b;transition:background 0.15s,color 0.15s,transform 0.15s;border:none;cursor:pointer; }
        .search-clear-btn:hover { background:#cbd5e1;color:#1e293b;transform:translateY(-50%) scale(1.1); }
        .search-hint { display:flex;align-items:center;gap:6px;margin-top:6px;padding:0 2px;font-size:10.5px;color:#94a3b8;font-weight:500; }
        .search-hint-tag { display:inline-flex;align-items:center;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:600;color:#64748b; }
      `}</style>

      {isProcessing && <Processing message="Dispensing medicines..." className="z-200" />}

      {notification && (
        <div className={`fixed top-5 right-5 z-100 toast-in flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium ${
          notification.type === 'success' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-white border-red-200 text-red-700'
        }`}>
          <span className={`w-2 h-2 rounded-full ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ animation: 'pulse-dot 1.5s ease infinite' }} />
          {notification.message}
        </div>
      )}

      {isPanelMinimized && (
        <button onClick={() => setIsPanelMinimized(false)}
          className="fab-btn fab-in fixed bottom-8 right-6 z-50 flex items-center gap-2.5 bg-slate-900 text-white pl-4 pr-5 py-3 rounded-full text-sm font-semibold">
          <span className="relative">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {dispensList.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{dispensList.length}</span>
            )}
          </span>
          Dispense Cart
          {dispensList.length > 0 && (
            <span className="bg-white bg-opacity-20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{dispensList.reduce((s, i) => s + i.quantity, 0)}</span>
          )}
        </button>
      )}

      <div className="min-h-screen bg-slate-50 transition-all duration-300 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">

          <div className="mb-8 sm:mb-10 slide-up">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Dispense Medicines</h1>
            <p className="text-sm text-slate-500">Select medicines and record patient information</p>
          </div>

          <div className={`grid grid-cols-1 gap-6 ${isPanelMinimized ? '' : 'xl:grid-cols-[1fr_400px]'}`}>

            {/* ── LEFT — Medicine Browser ── */}
            <div className="space-y-5 min-w-0">

              {/* Filters card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 slide-up" style={{ animationDelay: '0.05s' }}>

                {/* Search Bar */}
                <div className="mb-4">
                  <div className="search-bar-wrap">
                    <svg className="search-icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, brand, strength, unit…"
                      className={`search-bar-input${searchTerm ? ' has-value' : ''}`} />
                    {searchTerm && (
                      <button type="button" onClick={() => setSearchTerm('')} className="search-clear-btn" aria-label="Clear search">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="search-hint">
                    {searchTerm ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        <span><span className="font-bold text-slate-600">{filteredMedicines.length}</span> result{filteredMedicines.length !== 1 ? 's' : ''} for &ldquo;{searchTerm}&rdquo;</span>
                        {filteredMedicines.length === 0 && (
                          <button type="button" onClick={() => setSearchTerm('')} className="ml-auto text-blue-500 hover:text-blue-700 font-semibold text-[10.5px]">Clear</button>
                        )}
                      </>
                    ) : (
                      <>
                        <span>Search across</span>
                        <span className="search-hint-tag">name</span>
                        <span className="search-hint-tag">brand</span>
                        <span className="search-hint-tag">strength</span>
                        <span className="search-hint-tag">unit</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 mb-4" />

                {/* Quick Select */}
                <div className="mb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Quick Select</span>
                    {(quickSelectBaseName || quickSelectStrength) && (
                      <button type="button" onClick={() => { setQuickSelectBaseName(''); setQuickSelectStrength(''); }}
                        className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Clear filter
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={quickSelectBaseName} onChange={(e) => { setQuickSelectBaseName(e.target.value); setQuickSelectStrength(''); }}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${quickSelectBaseName ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-slate-50 border-slate-200'}`}>
                      <option value="">Medicine...</option>
                      {uniqueMedicineNames.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <select value={quickSelectStrength} onChange={(e) => setQuickSelectStrength(e.target.value)} disabled={!quickSelectBaseName}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${quickSelectStrength ? 'bg-purple-50 border-purple-300 text-purple-800' : 'bg-slate-50 border-slate-200'}`}>
                      <option value="">{quickSelectBaseName ? 'All Strengths' : '—'}</option>
                      {quickSelectBaseName && availableStrengths.map((item, idx) => {
                        const stock = getEffectiveStock(item.medicine);
                        const unit = getDispensableUnit(item.medicine) || 'units';
                        return <option key={idx} value={item.strength || 'Standard'} disabled={stock === 0}>{item.strength} ({stock} {unit})</option>;
                      })}
                    </select>
                  </div>
                  {quickSelectBaseName && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400 font-medium">Filtering:</span>
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">{quickSelectBaseName}</span>
                      {quickSelectStrength && (<><span className="text-[10px] text-slate-300">·</span><span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">{quickSelectStrength}</span></>)}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-4 mt-4 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Status</span>
                    {(['all', 'in', 'low', 'expiring', 'expired', 'out'] as const).map((s) => (
                      <button key={s} onClick={() => setFilterStock(s)}
                        className={`filter-chip text-xs font-medium px-3 py-1 rounded-full border border-slate-200 text-slate-600 ${filterStock === s ? 'active' : 'bg-slate-50'}`}>
                        {s === 'all' ? 'All' : s === 'in' ? 'In Stock' : s === 'low' ? 'Low' : s === 'expiring' ? 'Expiring' : s === 'expired' ? 'Expired' : 'Out'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unit</span>
                    <select value={filterUnit} onChange={(e) => setFilterUnit(e.target.value as 'all' | DispensableUnit)}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${filterUnit !== 'all' ? 'bg-blue-50 border-blue-300 text-blue-800' : 'bg-slate-50 border-slate-200'}`}>
                      <option value="all">All Units</option>
                      {availableUnits.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Age Group</span>
                    <select value={filterAgeGroup} onChange={(e) => setFilterAgeGroup(e.target.value as 'all' | string)}
                      className={`px-3 py-2 border rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${filterAgeGroup !== 'all' ? 'bg-green-50 border-green-300 text-green-800' : 'bg-slate-50 border-slate-200'}`}>
                      <option value="all">All Categories</option>
                      {availableAgeGroups.map((ag) => <option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </div>
                  {(searchTerm || activeFilterCount > 0) && (
                    <button type="button" onClick={() => { setSearchTerm(''); setFilterStock('all'); setFilterUnit('all'); setFilterAgeGroup('all'); setQuickSelectBaseName(''); setQuickSelectStrength(''); }}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-red-600 bg-slate-100 hover:bg-red-50 border border-slate-200 hover:border-red-200 px-2.5 py-1 rounded-lg transition-colors">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Clear all
                      <span className="bg-slate-300 text-slate-700 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">{activeFilterCount + (searchTerm ? 1 : 0)}</span>
                    </button>
                  )}
                  <div className="ml-auto flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5">
                    <button type="button" onClick={() => setViewMode('grid')}
                      className={`flex items-center justify-center p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                    </button>
                    <button type="button" onClick={() => setViewMode('table')}
                      className={`flex items-center justify-center p-1.5 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 10h18M3 14h18M3 18h18" /></svg>
                    </button>
                  </div>
                </div>
              </div>

              {!isLoadingMedicines && (
                <p className="text-xs text-slate-400 font-medium px-1">
                  Showing <span className="text-slate-600 font-semibold">{filteredMedicines.length}</span> of {dispensableMedicines.length} medicines
                  {searchTerm && <span className="ml-1 text-blue-500">for &ldquo;<span className="font-semibold">{searchTerm}</span>&rdquo;</span>}
                </p>
              )}

              {isLoadingMedicines ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                      <div className="flex items-center gap-4 mb-4"><div className="w-16 h-16 bg-slate-100 rounded-xl shrink-0" /><div className="flex-1 space-y-2"><div className="h-4 bg-slate-100 rounded-lg w-full" /><div className="h-3 bg-slate-100 rounded-lg w-2/3" /></div></div>
                      <div className="h-10 bg-slate-100 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : filteredMedicines.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
                  <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-slate-500 font-medium text-sm">No medicines match your filters</p>
                  {searchTerm && <p className="text-xs text-slate-400 mt-1">No results for &ldquo;{searchTerm}&rdquo;</p>}
                  <button onClick={() => { setSearchTerm(''); setFilterUnit('all'); setFilterStock('all'); setQuickSelectBaseName(''); setQuickSelectStrength(''); }} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Clear all filters</button>
                </div>
              ) : viewMode === 'grid' ? (
                <div key="grid" className={`medicine-grid grid gap-4 ${isPanelMinimized ? 'grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-2 xl:grid-cols-3'}`}>
                  {filteredMedicines.map((medicine) => {
                    const stock = getEffectiveStock(medicine);
                    const status = getMedicineStatus(medicine);
                    const inCart = dispensList.some((d) => d.medicine.id === medicine.id);
                    const outOfStock = stock === 0;
                    const cartIndex = dispensList.findIndex((d) => d.medicine.id === medicine.id);
                    const cartQty = cartIndex !== -1 ? dispensList[cartIndex].quantity : 0;
                    return (
                      <div key={medicine.id}
                        className={`medicine-card bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col cursor-pointer select-none transition-all ${inCart ? 'in-cart' : ''} ${outOfStock ? 'opacity-60' : ''}`}
                        onClick={() => !outOfStock && addMedicineToCart(medicine)}>
                        <div className="relative h-28 bg-linear-to-br from-slate-50 to-slate-100 overflow-hidden flex items-center justify-center">
                          {medicine.image
                            ? <Image src={medicine.image} alt={getDisplayName(medicine)} width={112} height={112} className="object-contain w-full h-full p-3" unoptimized />
                            : <div className="text-4xl opacity-50">💊</div>}
                          <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusConfig[status.variant].bg} ${statusConfig[status.variant].text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusConfig[status.variant].dot}`} />
                            {status.label}
                          </div>
                          {inCart && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                              <CheckCircle2 size={14} className="text-white" />
                            </div>
                          )}
                        </div>
                        <div className="p-3 flex flex-col gap-2 flex-1">
                          <div>
                            <p className="font-bold text-slate-900 text-sm leading-tight line-clamp-2">{getDisplayName(medicine)}</p>
                            {getDisplayBrand(medicine) && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{getDisplayBrand(medicine)}</p>}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {medicine.unit && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-md border border-blue-100">{medicine.unit}</span>}
                            {medicine.strength && <span className="px-1.5 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-md border border-violet-100">{medicine.strength}</span>}
                            {medicine.ageGroup && <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded-md border border-green-100">{medicine.ageGroup}</span>}
                          </div>
                          <div className="flex flex-col gap-1 mt-auto pt-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-slate-400">Stock: {stock}</p>
                              {inCart ? (
                                <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-xl px-1.5 py-1" onClick={e => e.stopPropagation()}>
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => commitQty(cartIndex, cartQty - 1)}><Minus size={13} strokeWidth={2.5} /></button>
                                  <span className="w-6 text-center text-sm font-bold text-blue-700">{cartQty}</span>
                                  <button className="qty-btn text-blue-600 hover:bg-blue-100" onClick={() => commitQty(cartIndex, cartQty + 1)}><Plus size={13} strokeWidth={2.5} /></button>
                                </div>
                              ) : (
                                <div className={`qty-btn ${outOfStock ? 'text-slate-300' : 'bg-slate-900 text-white hover:bg-blue-600'} shadow-sm`}>
                                  <Plus size={15} strokeWidth={2.5} />
                                </div>
                              )}
                            </div>
                            {getExpirationDisplay(getTrueEarliestExpiration(medicine)) && (
                              <p className={`text-[9px] font-medium ${
                                getTrueEarliestExpiration(medicine) && new Date(getTrueEarliestExpiration(medicine)!) < new Date() ? 'text-red-600' :
                                getTrueEarliestExpiration(medicine) && Math.floor((new Date(getTrueEarliestExpiration(medicine)!).getTime() - new Date().getTime()) / 86400000) <= 30 ? 'text-amber-600' :
                                'text-slate-500'
                              }`}>Exp: {getExpirationDisplay(getTrueEarliestExpiration(medicine))}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div key="table" className="bg-white rounded-2xl border border-slate-200 overflow-hidden fade-in min-w-0">
                  <div className="overflow-x-auto w-full">
                    <table className="text-sm" style={{ minWidth: '560px', width: '100%', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '34%' }} /><col style={{ width: '14%' }} /><col style={{ width: '11%' }} />
                        <col style={{ width: '7%' }} /><col style={{ width: '7%' }} /><col style={{ width: '13%' }} /><col style={{ width: '14%' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Name', 'Unit Type', 'Strength', 'Stock', 'Min', 'Status', 'Action'].map((h) => (
                            <th key={h} className={`px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${h === 'Action' ? 'text-center' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMedicines.map((medicine) => {
                          const stock = getEffectiveStock(medicine);
                          const minStockVal = getMinStock(medicine);
                          const dispUnit = getDispensableUnit(medicine)!;
                          const status = getMedicineStatus(medicine);
                          const inCart = dispensList.some((d) => d.medicine.id === medicine.id);
                          const convLabel = getConversionLabel(medicine);
                          return (
                            <tr key={medicine.id} className={`transition-colors hover:bg-slate-50 ${inCart ? 'bg-blue-50/40' : ''}`}>
                              <td className="px-3 py-3 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  {medicine.image
                                    ? <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 shrink-0"><Image src={medicine.image} alt={getDisplayName(medicine)} width={32} height={32} className="object-cover w-full h-full" unoptimized /></div>
                                    : <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-sm">💊</div>}
                                  <div className="min-w-0 flex-1 overflow-hidden">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <p className="font-semibold text-slate-900 truncate text-xs leading-snug">{getDisplayName(medicine)}</p>
                                      {inCart && <div className="w-3.5 h-3.5 bg-blue-600 rounded-full flex items-center justify-center shrink-0"><svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>}
                                    </div>
                                    {getDisplayBrand(medicine) && <p className="text-[10px] text-slate-400 truncate leading-snug">{getDisplayBrand(medicine)}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3"><div className="flex flex-col gap-0.5"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border w-fit max-w-full truncate ${getUnitStyles(dispUnit).badge}`}>{dispUnit}</span>{convLabel && <span className="text-[9px] text-slate-400 font-medium truncate">{convLabel}</span>}</div></td>
                              <td className="px-3 py-3"><div className="flex flex-col gap-0.5">{medicine.strength ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 border border-purple-200 w-fit truncate">{medicine.strength}</span> : <span className="text-slate-400 text-xs">—</span>}{medicine.ageGroup && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 w-fit truncate">{medicine.ageGroup}</span>}</div></td>
                              <td className="px-3 py-3"><span className="text-xs font-medium text-slate-700">{stock}</span></td>
                              <td className="px-3 py-3"><span className="text-xs font-medium text-slate-700">{minStockVal > 0 ? minStockVal : <span className="text-slate-400 text-[10px]">—</span>}</span></td>
                              <td className="px-3 py-3"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-lg border whitespace-nowrap ${statusStyles[status.variant]}`}>{status.label}</span></td>
                              <td className="px-3 py-3 text-center"><button onClick={() => addMedicineToCart(medicine)} disabled={stock === 0} className={`px-2.5 py-1.5 text-[10px] font-semibold rounded-lg transition-colors whitespace-nowrap ${stock === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : getUnitStyles(dispUnit).btn}`}>+ Add</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-400 font-medium">{filteredMedicines.length} medicine{filteredMedicines.length !== 1 ? 's' : ''} shown</div>
                </div>
              )}
            </div>

            {/* ── RIGHT — Dispense Panel ── */}
            {!isPanelMinimized && (
              <div className="xl:sticky xl:top-6 h-fit space-y-4">
                <div className="space-y-4 panel-expanded">
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden slide-up" style={{ animationDelay: '0.1s' }}>
                    <div className="flex border-b border-slate-200">
                      {([1, 2] as const).map((step) => (
                        <button key={step} onClick={() => setActiveStep(step)}
                          className={`step-tab flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-slate-400 ${activeStep === step ? 'active' : ''}`}>
                          <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${activeStep === step ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{step}</span>
                          {step === 1 ? 'Patient' : 'Medicines'}
                        </button>
                      ))}
                      {activeStep === 1 && (
                        <button onClick={() => setIsPatientExpanded(true)} title="Expand patient form"
                          className="expand-btn px-3.5 text-slate-400 border-l border-slate-100 flex items-center justify-center">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        </button>
                      )}
                      <button onClick={() => setIsPanelMinimized(true)} className="minimize-btn px-4 text-slate-300 rounded-none border-l border-slate-100">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" /></svg>
                      </button>
                    </div>

                    <div className="p-4">
                      {activeStep === 2 && (
                        <div className="fade-in">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected</p>
                            {dispensList.length > 0 && <button onClick={() => { setDispenseList([]); setQtyInputs({}); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Clear all</button>}
                          </div>
                          {dispensList.length === 0 ? (
                            <div className="py-10 text-center">
                              <div className="w-12 h-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center mx-auto mb-3"><svg className="w-5 h-5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
                              <p className="text-sm text-slate-400 font-medium">No medicines selected</p>
                              <p className="text-xs text-slate-300 mt-1">Click medicines from the list</p>
                            </div>
                          ) : (
                            <div className="scroll-area max-h-80 overflow-y-auto -mx-4">
                              {dispensList.map((item, idx) => renderCartItem(item, idx))}
                            </div>
                          )}
                          {dispensList.length > 0 && (
                            <button onClick={() => setActiveStep(1)} className="mt-4 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                              ← Back to Patient Info
                            </button>
                          )}
                        </div>
                      )}
                      {activeStep === 1 && (
                        <div className="scroll-area max-h-[calc(100vh-220px)] overflow-y-auto pr-1 -mr-1">
                          <PatientForm patientInfo={patientInfo} onChange={handlePatientChange} expanded={false} canDispense={canDispense} dispensCount={dispensList.length} onConfirm={() => setShowConfirmModal(true)} onBack={() => setActiveStep(2)} patients={patients} isLoadingPatients={isLoadingPatients} selectedPatientId={selectedPatientId} onSelectPatient={handleSelectPatient} onClearForm={handleClearForm} />
                        </div>
                      )}
                    </div>
                  </div>

                  {dispensList.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 slide-up fade-in">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Order Summary</p>
                      <div className="space-y-1.5 mb-3">
                        {dispensList.map((item, i) => (
                          <div key={i} className="flex justify-between items-center text-sm">
                            <div className="min-w-0 pr-2"><span className="text-slate-700 truncate block">{getDisplayName(item.medicine)}</span>{item.medicine.strength && <span className="text-slate-400 text-xs">{item.medicine.strength}</span>}</div>
                            <span className="text-slate-500 font-medium shrink-0">{item.quantity}× {item.unitType}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-slate-100 pt-3 flex justify-between text-xs font-semibold text-slate-600">
                        <span>Total items</span>
                        <span>{dispensList.reduce((s, i) => s + i.quantity, 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl slide-up">
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
                <div><h3 className="dispense-heading text-lg font-bold text-slate-900">Confirm Dispensing</h3><p className="text-xs text-slate-400">Review details before confirming</p></div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Patient</p>
                <p className="font-semibold text-slate-800">{[patientInfo.lastName, [patientInfo.firstName, patientInfo.middleName].filter(Boolean).join(' ')].filter(Boolean).join(', ')}{patientInfo.suffix ? ` ${patientInfo.suffix}` : ''}</p>
                <div className="flex flex-wrap gap-3 mt-1">
                  {patientInfo.dateOfBirth && <p className="text-xs text-slate-500">DOB: <span className="font-medium text-slate-700">{patientInfo.dateOfBirth}</span></p>}
                  {patientInfo.sex && <p className="text-xs text-slate-500">Sex: <span className="font-medium text-slate-700">{patientInfo.sex}</span></p>}
                  {patientInfo.patientContactNo && <p className="text-xs text-slate-500">Contact: <span className="font-medium text-slate-700">{patientInfo.patientContactNo}</span></p>}
                </div>
                {patientInfo.philhealthMember === 'YES' && (patientInfo.memberPhilhealthNo || patientInfo.independentsPhilhealthNo) && (
                  <p className="text-xs text-slate-500 mt-1">PhilHealth: <span className="font-medium text-slate-700">{patientInfo.memberPhilhealthNo || patientInfo.independentsPhilhealthNo}</span></p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Medicines</p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto scroll-area">
                  {dispensList.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div><p className="text-sm font-medium text-slate-800">{getDisplayName(item.medicine)}</p><p className="text-xs text-slate-400">{[getDisplayDescription(item.medicine) || getDisplayBrand(item.medicine), item.medicine.strength, item.unitType].filter(Boolean).join(' · ')}</p></div>
                      <div className="text-right"><p className="text-sm font-bold text-slate-700">{item.quantity}</p><p className="text-xs text-slate-400">{item.unitType}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition text-sm">Cancel</button>
              <button onClick={handleDispense} disabled={isProcessing} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition text-sm shadow-lg shadow-emerald-200">{isProcessing ? 'Processing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Medicine Selector Modal */}
      {medicineModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 fade-in" style={{ backdropFilter: 'blur(8px)', background: 'rgba(15,23,42,0.5)' }}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl slide-up max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-800">Select Medicine</h3>
                <button onClick={() => { setMedicineModalOpen(false); setSelectedBaseName(''); }} className="text-slate-400 hover:text-slate-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Medicine Name</label>
                <select value={selectedBaseName} onChange={(e) => setSelectedBaseName(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                  <option value="">Choose a medicine...</option>
                  {uniqueMedicineNames.map((n) => { const count = medicinesByBaseName.get(n)?.length || 0; return <option key={n} value={n}>{n} ({count} strength{count !== 1 ? 's' : ''})</option>; })}
                </select>
              </div>
              {selectedBaseName && availableStrengths.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Strength / Variant</label>
                  <div className="flex flex-wrap gap-2">
                    {availableStrengths.map((item, idx) => {
                      const stock = getEffectiveStock(item.medicine);
                      const status = getMedicineStatus(item.medicine);
                      const dispUnit = getDispensableUnit(item.medicine);
                      return (
                        <button key={idx} onClick={() => { addMedicineToCart(item.medicine); setMedicineModalOpen(false); setSelectedBaseName(''); }} disabled={stock === 0}
                          className={`inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-sm font-medium shadow-sm transition-colors ${stock === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50' : 'bg-gray-900 text-white hover:bg-black'}`}>
                          <span className="font-bold">{item.strength}</span>
                          <span className="text-gray-300 text-xs">· {stock} {dispUnit}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ml-0.5 ${statusStyles[status.variant]}`}>{status.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedBaseName && availableStrengths.length === 0 && <div className="py-6 text-center"><p className="text-sm text-slate-500 font-medium">No variants available</p></div>}
            </div>
            <div className="px-6 pb-6 border-t border-slate-100 pt-4">
              <button onClick={() => { setMedicineModalOpen(false); setSelectedBaseName(''); }} className="w-full py-2.5 border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Patient Form Modal */}
      {isPatientExpanded && (
        <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 fade-in" style={{ backdropFilter: 'blur(10px)', background: 'rgba(15,23,42,0.6)' }}>
          <div className="expand-in bg-white flex flex-col w-full sm:rounded-2xl shadow-2xl sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl h-full sm:h-auto sm:max-h-[95vh] overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-slate-100 shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 shadow-sm" style={{ width: 44, height: 44 }}>
                  <Image src={logoSrc} alt="Passi City Primary Health Care Facility" width={44} height={44} className="object-cover w-full h-full" priority unoptimized />
                </div>
                <div><h2 className="dispense-heading text-lg sm:text-xl font-bold text-slate-900">Patient Record</h2><p className="text-xs text-slate-400">Fill in all applicable fields</p></div>
              </div>
              <button onClick={() => setIsPatientExpanded(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto scroll-area px-5 sm:px-8 py-6">
                <PatientForm patientInfo={patientInfo} onChange={handlePatientChange} expanded={true} canDispense={canDispense} dispensCount={dispensList.length} onConfirm={() => { setIsPatientExpanded(false); setShowConfirmModal(true); }} onBack={() => setIsPatientExpanded(false)} patients={patients} isLoadingPatients={isLoadingPatients} selectedPatientId={selectedPatientId} onSelectPatient={handleSelectPatient} onClearForm={handleClearForm} />
              </div>
              <div className="lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/60 flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 shrink-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Order Summary</p>
                </div>
                <div className="flex-1 overflow-y-auto scroll-area max-h-48 lg:max-h-none">
                  {dispensList.length === 0
                    ? <p className="text-xs text-slate-400 text-center py-6">No medicines selected</p>
                    : dispensList.map((item, i) => renderCartItem(item, i))}
                </div>
                {dispensList.length > 0 && (
                  <div className="px-5 py-4 border-t border-slate-200 bg-white shrink-0">
                    <div className="flex justify-between text-sm font-semibold text-slate-600 mb-3">
                      <span>Total items</span><span>{dispensList.reduce((s, ii) => s + ii.quantity, 0)}</span>
                    </div>
                    <button onClick={() => { setIsPatientExpanded(false); setShowConfirmModal(true); }} disabled={!canDispense}
                      className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${canDispense ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-200' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                      {canDispense ? `Dispense ${dispensList.length} Item${dispensList.length !== 1 ? 's' : ''}` : 'Fill required fields'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
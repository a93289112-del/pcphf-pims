'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useSidebar } from '@/lib/contexts/sidebar-context';
import ConfirmationModal from '@/lib/components/confirmation-modal';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { database, getUserPath } from '@/lib/services/firebase';
import { ref, onValue, remove } from 'firebase/database';
import Image from 'next/image';
import logoSrc from '@/app/assets/Logo/pharmacylogo.jpeg.png';
import Processing from '@/lib/components/processing';

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface DispensingItem {
  medicineId: string;
  medicineName: string;
  medicineDescription?: string;
  brand: string;
  quantity: number;
  quantityType: string;
  unitType?: string;
  selectedStrength?: string | null;
  prescriptionRequired: boolean;
  piecesPerUnit?: number | null;
  stockBeforeDispense?: number;
  expirationDate?: string;
  batchLot?: string;
  minStock?: number;
}

interface PatientInfo {
  lastName?: string; firstName?: string; middleName?: string; suffix?: string; maidenName?: string;
  sex?: string; dateOfBirth?: string; placeOfBirth?: string;
  bloodType?: string; religion?: string; residentialAddress?: string;
  civilStatus?: string; spouseName?: string;
  educationalAttainment?: string; employmentStatus?: string; occupation?: string;
  familyMemberPosition?: string; familyMemberOther?: string;
  patientContactNo?: string; motherName?: string; motherDateOfBirth?: string;
  dswdNhts?: string; familyHouseholdNumber?: string;
  fourPsMember?: string; householdNumber?: string;
  philhealthMember?: string; philhealthStatusType?: string; philhealthRelationship?: string;
  memberLastName?: string; memberFirstName?: string; memberMiddleName?: string; memberSuffix?: string;
  memberDateOfBirth?: string; memberGender?: string;
  memberPhilhealthNo?: string; independentsPhilhealthNo?: string;
  philhealthCategory?: string; pcbEligible?: string; pcbDateOfEnlistment?: string;
  notes?: string;
}

interface Dispensing {
  id: string;
  date: string;
  patientName: string;
  patientId: string;
  age?: string;
  notes?: string;
  patientInfo?: PatientInfo;
  items: DispensingItem[];
  dispensedBy: string;
}

type DispensingRecord = Omit<Dispensing, 'id'>;
type ViewMode = 'table' | 'grid';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dedupeById<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((item) => { if (seen.has(item.id)) return false; seen.add(item.id); return true; });
}
function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return iso; }
}
function formatDateShort(iso: string): string {
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
function resolveQtyType(item: DispensingItem): string {
  const raw = (item.quantityType || item.unitType || '').toLowerCase().trim();
  if (!raw) return 'units';
  if (/^(pieces?|pcs?)$/.test(raw)) return 'pcs';
  if (/^(tablets?|tabs?)$/.test(raw)) return 'tabs';
  if (/^(capsules?|caps?)$/.test(raw)) return 'caps';
  if (/^(bottles?)$/.test(raw)) return 'btl';
  if (/^(boxes?|box)$/.test(raw)) return 'box';
  if (/^(sachets?)$/.test(raw)) return 'sac';
  if (/^(vials?)$/.test(raw)) return 'vial';
  if (/^(ampules?|amps?)$/.test(raw)) return 'amp';
  return item.quantityType || item.unitType || 'units';
}
function summariseTotals(items: DispensingItem[]): string {
  const map: Record<string, number> = {};
  items.forEach((i) => { const l = resolveQtyType(i); map[l] = (map[l] || 0) + i.quantity; });
  return Object.entries(map).map(([l, q]) => `${q} ${l}`).join(', ');
}
function checkMedicineStatus(expirationDate?: string): { isExpired: boolean; isExpiring: boolean } {
  if (!expirationDate) return { isExpired: false, isExpiring: false };
  const today = new Date();
  const expDate = new Date(expirationDate);
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    isExpired: expDate < today,
    isExpiring: expDate < thirtyDaysFromNow && expDate >= today,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const Badge = ({ value, color = 'slate' }: { value?: string; color?: 'blue' | 'green' | 'red' | 'purple' | 'slate' | 'amber' }) => {
  if (!value) return <span className="text-slate-300 text-xs">—</span>;
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-700 border-blue-200',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:    'bg-red-50 text-red-600 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    amber:  'bg-amber-50 text-amber-700 border-amber-200',
    slate:  'bg-slate-100 text-slate-600 border-slate-200',
  };
  return <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[color]}`}>{value}</span>;
};

const Field = ({ label, value, full = false, children }: { label: string; value?: string; full?: boolean; children?: React.ReactNode }) => (
  <div className={`${full ? 'col-span-2' : ''}`}>
    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
    {children ?? (value ? <p className="text-xs font-semibold text-slate-800 leading-snug">{value}</p> : <p className="text-xs text-slate-300">—</p>)}
  </div>
);

const SectionHeader = ({ roman, title, color = 'blue' }: { roman: string; title: string; color?: string }) => (
  <div className={`flex items-center gap-2 mb-4 pb-2 border-b-2 border-${color}-100`}>
    <span className={`w-6 h-6 rounded-full bg-${color}-100 text-${color}-700 text-[10px] font-black flex items-center justify-center shrink-0`}>{roman}</span>
    <h3 className={`text-xs font-black uppercase tracking-widest text-${color}-700`}>{title}</h3>
  </div>
);

// ─── Patient Enrollment Modal ─────────────────────────────────────────────────
function PatientEnrollmentModal({ record, onClose }: { record: Dispensing; onClose: () => void }) {
  const pi = record.patientInfo;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6"
      style={{ backdropFilter: 'blur(12px)', background: 'rgba(15,23,42,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-expand bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-full overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 shadow-sm" style={{ width: 44, height: 44 }}>
              <Image
                src={logoSrc}
                alt="Passi City Primary Health Care Facility"
                width={44}
                height={44}
                className="object-cover w-full h-full"
                priority
                unoptimized
              />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-widest truncate">Passi City Primary Health Care Facility</p>
              <h2 className="text-base font-black text-white tracking-tight">Patient Record</h2>
            </div>
          </div>
        </div>

        {/* Two-column body — stacks on mobile */}
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

          {/* LEFT — Patient enrollment form (scrollable) */}
          <div className="flex-1 overflow-y-auto scroll-area px-4 sm:px-6 py-5 space-y-6">

            <section>
              <SectionHeader roman="I" title="Patient Information (Impormasyon ng Pasyente)" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <Field label="Last Name (Apelyido)" value={pi?.lastName || record.patientName.split(',')[0]?.trim()} />
                <Field label="First Name (Pangalan)" value={pi?.firstName || record.patientName.split(',')[1]?.split(' ')[1]?.trim()} />
                <Field label="Middle Name" value={pi?.middleName} />
                <Field label="Suffix" value={pi?.suffix} />
                <Field label="Maiden Name" value={pi?.maidenName} />
                <Field label="Sex (Kasarian)"><Badge value={pi?.sex} color={pi?.sex === 'Male' ? 'blue' : 'purple'} /></Field>
                <Field label="Date of Birth" value={pi?.dateOfBirth} />
                <Field label="Place of Birth" value={pi?.placeOfBirth} />
                <Field label="Blood Type (Rh+/-)" value={pi?.bloodType} />
                <Field label="Religion" value={pi?.religion} />
                <Field label="Residential Address" value={pi?.residentialAddress} full />
                <Field label="Civil Status"><Badge value={pi?.civilStatus} color="slate" /></Field>
                <Field label="Spouse Name" value={pi?.spouseName} />
              </div>
            </section>

            <section>
              <SectionHeader roman="Ed" title="Education & Employment" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                <Field label="Educational Attainment"><Badge value={pi?.educationalAttainment} color="blue" /></Field>
                <Field label="Employment Status"><Badge value={pi?.employmentStatus} color={pi?.employmentStatus === 'Employed' ? 'green' : 'slate'} /></Field>
                <Field label="Occupation" value={pi?.occupation} />
              </div>
            </section>

            <section>
              <SectionHeader roman="Fm" title="Family (Pamilya)" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                <Field label="Family Member Position">
                  <Badge value={pi?.familyMemberPosition === 'Others' ? pi.familyMemberOther : pi?.familyMemberPosition} color="slate" />
                </Field>
                <Field label="Patient Contact No." value={pi?.patientContactNo} />
                <Field label="Mother's Name" value={pi?.motherName} />
                <Field label="Mother's Date of Birth" value={pi?.motherDateOfBirth} />
              </div>
            </section>

            <section>
              <SectionHeader roman="II" title="DSWD / Household" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <Field label="DSWD NHTS?"><Badge value={pi?.dswdNhts} color={pi?.dswdNhts === 'YES' ? 'green' : 'slate'} /></Field>
                <Field label="Family Household No." value={pi?.familyHouseholdNumber} />
                <Field label="4P's Member?"><Badge value={pi?.fourPsMember} color={pi?.fourPsMember === 'YES' ? 'green' : 'slate'} /></Field>
                <Field label="Household Number" value={pi?.householdNumber} />
              </div>
            </section>

            <section>
              <SectionHeader roman="III" title="PhilHealth" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <Field label="PhilHealth Member?"><Badge value={pi?.philhealthMember} color={pi?.philhealthMember === 'YES' ? 'green' : 'red'} /></Field>
                <Field label="Status Type"><Badge value={pi?.philhealthStatusType} color="blue" /></Field>
                <Field label="Relationship to Member"><Badge value={pi?.philhealthRelationship} color="slate" /></Field>
                <Field label="PhilHealth Category"><Badge value={pi?.philhealthCategory} color="purple" /></Field>
              </div>

              {pi?.philhealthMember === 'YES' && (
                <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mb-3">Member Details</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                    <Field label="Member Last Name"  value={pi?.memberLastName} />
                    <Field label="Member First Name" value={pi?.memberFirstName} />
                    <Field label="Member Middle Name" value={pi?.memberMiddleName} />
                    <Field label="Member Suffix"     value={pi?.memberSuffix} />
                    <Field label="Member DOB"        value={pi?.memberDateOfBirth} />
                    <Field label="Member Gender"><Badge value={pi?.memberGender} color={pi?.memberGender === 'Male' ? 'blue' : 'purple'} /></Field>
                    <Field label="Member PhilHealth No." value={pi?.memberPhilhealthNo} />
                    <Field label="Independents PhilHealth No." value={pi?.independentsPhilhealthNo} />
                  </div>
                </div>
              )}
            </section>

            <section>
              <SectionHeader roman="IV" title="PCB Eligibility" color="blue" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
                <Field label="PCB Eligible?"><Badge value={pi?.pcbEligible} color={pi?.pcbEligible === 'YES' ? 'green' : 'slate'} /></Field>
                <Field label="Date of Enlistment" value={pi?.pcbDateOfEnlistment} />
              </div>
            </section>

            {(pi?.notes || record.notes) && (
              <section>
                <SectionHeader roman="N" title="Notes / Special Instructions" color="blue" />
                <p className="text-xs text-slate-700 leading-relaxed bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">{pi?.notes || record.notes}</p>
              </section>
            )}
          </div>

          {/* RIGHT — Medicines dispensed + record meta */}
          <div className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 bg-slate-50/60 flex flex-col overflow-hidden max-h-64 lg:max-h-none">

            <div className="px-5 py-4 border-b border-slate-100 bg-white shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-3">Dispensing Record</p>
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-slate-400">Date</span>
                  <span className="text-xs font-semibold text-slate-700 text-right">{formatDate(record.date)}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-slate-400">Dispensed By</span>
                  <span className="text-xs font-mono font-semibold text-slate-700 text-right truncate max-w-[140px]">{record.dispensedBy}</span>
                </div>
                {record.patientId && (
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-slate-400">Patient ID</span>
                    <span className="text-xs font-semibold text-slate-700 text-right">{record.patientId}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto scroll-area">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Medicines Dispensed & Inventory</p>
              </div>
              <div className="px-5 py-3 space-y-2">
                {record.items.map((item, i) => {
                  const stockAfter = (item.stockBeforeDispense ?? 0) - item.quantity;
                  const { isExpired, isExpiring } = checkMedicineStatus(item.expirationDate);
                  const isLowStock = item.minStock && stockAfter <= item.minStock;

                  return (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-bold text-slate-800 leading-snug">{item.medicineName}</p>
                        {item.prescriptionRequired && <span className="rx-badge shrink-0">RX</span>}
                      </div>
                      {item.selectedStrength && (
                        <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 mb-1.5 mr-1.5">{item.selectedStrength}</span>
                      )}
                      {isExpired && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 mb-1.5">EXPIRED</span>}
                      {isExpiring && !isExpired && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 mb-1.5">EXPIRING</span>}
                      {isLowStock && !isExpired && !isExpiring && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200 mb-1.5">LOW STOCK</span>}
                      {item.brand && <p className="text-[10px] text-slate-400 mb-2">{item.brand}</p>}

                      <div className="space-y-1 mb-2.5 p-2 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Qty Dispensed:</span>
                          <span className="text-slate-700 font-semibold">{item.quantity} {resolveQtyType(item)}</span>
                        </div>
                        {item.stockBeforeDispense !== undefined && (
                          <>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Stock Before:</span>
                              <span className="text-slate-700 font-semibold">{item.stockBeforeDispense}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-400">Stock After:</span>
                              <span className={`font-semibold ${isLowStock ? 'text-yellow-700' : 'text-slate-700'}`}>{stockAfter}</span>
                            </div>
                          </>
                        )}
                        {item.expirationDate && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Expiration:</span>
                            <span className={`font-semibold ${isExpired ? 'text-red-700' : isExpiring ? 'text-amber-700' : 'text-slate-700'}`}>
                              {new Date(item.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                            </span>
                          </div>
                        )}
                        {item.minStock && (
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400">Min Stock:</span>
                            <span className="text-slate-700 font-semibold">{item.minStock}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">Total Dispensed</span>
                  <span className="text-sm font-black text-slate-900">{summariseTotals(record.items)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-slate-400 truncate mr-4">
            Record ID: <span className="font-mono">{record.id}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={async () => {
              try {
                // Fetch and convert logo to base64
                const logoPath = typeof logoSrc === 'string' ? logoSrc : logoSrc.src;
                const logoResponse = await fetch(logoPath);
                const logoBlob = await logoResponse.blob();
                const logoBase64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(logoBlob);
                });

                const medicinesList = record.items.map((item) => `
                  <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: left;">${item.medicineName}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.selectedStrength || '-'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity} ${resolveQtyType(item)}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.expirationDate ? new Date(item.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.prescriptionRequired ? '⚕' : '-'}</td>
                  </tr>
                `).join('');

                const receiptHtml = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="UTF-8">
                    <title>Dispensing Receipt</title>
                    <style>
                      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 15px; background: white; }
                      .receipt { max-width: 800px; margin: 0 auto; }
                      .header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1e40af; padding-bottom: 15px; }
                      .logo { width: 75px; height: 75px; margin: 0 auto 12px; display: block; border-radius: 50%; border: 2px solid #e2e8f0; background: white; object-fit: cover; }
                      .facility-name { font-weight: bold; font-size: 16px; margin-bottom: 3px; color: #1e3a8a; }
                      .receipt-title { font-size: 14px; font-weight: bold; color: #1e40af; }
                      .section-title { font-weight: bold; font-size: 12px; margin-top: 15px; margin-bottom: 8px; padding: 6px 8px; background: #eff6ff; border-left: 3px solid #1e40af; }
                      .form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 12px; }
                      .form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
                      .form-field { font-size: 11px; }
                      .field-label { font-weight: 600; color: #1e3a8a; font-size: 10px; }
                      .field-value { font-size: 11px; color: #333; margin-top: 2px; word-break: break-word; }
                      .medicine-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
                      .medicine-table th { background: #1e40af; color: white; padding: 8px; font-size: 10px; font-weight: bold; }
                      .medicine-table th:first-child { text-align: left; }
                      .medicine-table th:not(:first-child) { text-align: center; }
                      .medicine-table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
                      .medicine-table td:first-child { text-align: left; }
                      .medicine-table td:not(:first-child) { text-align: center; }
                      .footer { margin-top: 15px; padding-top: 10px; border-top: 3px solid #1e40af; text-align: center; font-size: 10px; }
                      .total { margin-bottom: 10px; font-weight: bold; font-size: 12px; color: #1e40af; }
                      .footer-note { color: #666; font-size: 9px; margin-top: 10px; }
                      
                      @media print {
                        body { margin: 0; padding: 10px; }
                        .receipt { max-width: 100%; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                      }
                    </style>
                  </head>
                  <body>
                    <div class="receipt">
                      <div class="header">
                        <img src="${logoBase64}" alt="Logo" class="logo">
                        <div class="facility-name">Passi City Primary Health Care Facility</div>
                        <div class="receipt-title">PATIENT DISPENSING RECORD</div>
                      </div>
                      
                      <!-- PATIENT INFORMATION SECTION I -->
                      <div class="section-title">I. PATIENT INFORMATION (Impormasyon ng Pasyente)</div>
                      <div class="form-grid">
                        <div class="form-field">
                          <div class="field-label">Last Name</div>
                          <div class="field-value">${record.patientInfo?.lastName || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">First Name</div>
                          <div class="field-value">${record.patientInfo?.firstName || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Middle Name</div>
                          <div class="field-value">${record.patientInfo?.middleName || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Suffix</div>
                          <div class="field-value">${record.patientInfo?.suffix || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Maiden Name</div>
                          <div class="field-value">${record.patientInfo?.maidenName || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Sex (Kasarian)</div>
                          <div class="field-value">${record.patientInfo?.sex || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Date of Birth</div>
                          <div class="field-value">${record.patientInfo?.dateOfBirth || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Place of Birth</div>
                          <div class="field-value">${record.patientInfo?.placeOfBirth || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Blood Type</div>
                          <div class="field-value">${record.patientInfo?.bloodType || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Religion</div>
                          <div class="field-value">${record.patientInfo?.religion || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Civil Status</div>
                          <div class="field-value">${record.patientInfo?.civilStatus || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Spouse Name</div>
                          <div class="field-value">${record.patientInfo?.spouseName || '-'}</div>
                        </div>
                      </div>
                      <div class="form-field" style="margin-bottom: 12px;">
                        <div class="field-label">Residential Address</div>
                        <div class="field-value">${record.patientInfo?.residentialAddress || '-'}</div>
                      </div>
                      
                      <!-- EDUCATION & EMPLOYMENT SECTION Ed -->
                      <div class="section-title">Ed. EDUCATION & EMPLOYMENT</div>
                      <div class="form-row">
                        <div class="form-field">
                          <div class="field-label">Educational Attainment</div>
                          <div class="field-value">${record.patientInfo?.educationalAttainment || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Employment Status</div>
                          <div class="field-value">${record.patientInfo?.employmentStatus || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Occupation</div>
                          <div class="field-value">${record.patientInfo?.occupation || '-'}</div>
                        </div>
                      </div>
                      
                      <!-- FAMILY SECTION Fm -->
                      <div class="section-title">Fm. FAMILY (Pamilya)</div>
                      <div class="form-row">
                        <div class="form-field">
                          <div class="field-label">Family Member Position</div>
                          <div class="field-value">${record.patientInfo?.familyMemberPosition === 'Others' ? record.patientInfo.familyMemberOther : (record.patientInfo?.familyMemberPosition || '-')}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Patient Contact No.</div>
                          <div class="field-value">${record.patientInfo?.patientContactNo || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Mother's Name</div>
                          <div class="field-value">${record.patientInfo?.motherName || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Mother's DOB</div>
                          <div class="field-value">${record.patientInfo?.motherDateOfBirth || '-'}</div>
                        </div>
                      </div>
                      
                      <!-- DSWD/HOUSEHOLD SECTION II -->
                      <div class="section-title">II. DSWD / HOUSEHOLD</div>
                      <div class="form-grid">
                        <div class="form-field">
                          <div class="field-label">DSWD NHTS?</div>
                          <div class="field-value">${record.patientInfo?.dswdNhts || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Family Household No.</div>
                          <div class="field-value">${record.patientInfo?.familyHouseholdNumber || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">4P's Member?</div>
                          <div class="field-value">${record.patientInfo?.fourPsMember || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Household Number</div>
                          <div class="field-value">${record.patientInfo?.householdNumber || '-'}</div>
                        </div>
                      </div>
                      
                      <!-- PHILHEALTH SECTION III -->
                      <div class="section-title">III. PHILHEALTH</div>
                      <div class="form-grid">
                        <div class="form-field">
                          <div class="field-label">PhilHealth Member?</div>
                          <div class="field-value">${record.patientInfo?.philhealthMember || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Status Type</div>
                          <div class="field-value">${record.patientInfo?.philhealthStatusType || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Relationship</div>
                          <div class="field-value">${record.patientInfo?.philhealthRelationship || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">PhilHealth Category</div>
                          <div class="field-value">${record.patientInfo?.philhealthCategory || '-'}</div>
                        </div>
                        ${record.patientInfo?.philhealthMember === 'YES' ? `
                          <div class="form-field">
                            <div class="field-label">Member Last Name</div>
                            <div class="field-value">${record.patientInfo?.memberLastName || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member First Name</div>
                            <div class="field-value">${record.patientInfo?.memberFirstName || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member Middle Name</div>
                            <div class="field-value">${record.patientInfo?.memberMiddleName || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member Suffix</div>
                            <div class="field-value">${record.patientInfo?.memberSuffix || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member DOB</div>
                            <div class="field-value">${record.patientInfo?.memberDateOfBirth || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member Gender</div>
                            <div class="field-value">${record.patientInfo?.memberGender || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Member PhilHealth No.</div>
                            <div class="field-value">${record.patientInfo?.memberPhilhealthNo || '-'}</div>
                          </div>
                          <div class="form-field">
                            <div class="field-label">Independents PhilHealth No.</div>
                            <div class="field-value">${record.patientInfo?.independentsPhilhealthNo || '-'}</div>
                          </div>
                        ` : ''}
                      </div>
                      
                      <!-- PCB ELIGIBILITY SECTION IV -->
                      <div class="section-title">IV. PCB ELIGIBILITY</div>
                      <div class="form-row">
                        <div class="form-field">
                          <div class="field-label">PCB Eligible?</div>
                          <div class="field-value">${record.patientInfo?.pcbEligible || '-'}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Date of Enlistment</div>
                          <div class="field-value">${record.patientInfo?.pcbDateOfEnlistment || '-'}</div>
                        </div>
                      </div>
                      
                      <!-- DISPENSING INFORMATION -->
                      <div class="section-title">DISPENSING INFORMATION</div>
                      <div class="form-row">
                        <div class="form-field">
                          <div class="field-label">Dispensing Date</div>
                          <div class="field-value">${formatDate(record.date)}</div>
                        </div>
                        <div class="form-field">
                          <div class="field-label">Dispensed By</div>
                          <div class="field-value">${record.dispensedBy}</div>
                        </div>
                        ${record.patientId ? `<div class="form-field">
                          <div class="field-label">Patient ID</div>
                          <div class="field-value">${record.patientId}</div>
                        </div>` : ''}
                      </div>
                      
                      <!-- MEDICINES DISPENSED -->
                      <div class="section-title">MEDICINES DISPENSED</div>
                      <table class="medicine-table">
                        <thead>
                          <tr>
                            <th>Medicine Name</th>
                            <th>Strength</th>
                            <th>Quantity</th>
                            <th>Expiration</th>
                            <th>Rx</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${medicinesList}
                        </tbody>
                      </table>
                      
                      <!-- NOTES -->
                      ${record.patientInfo?.notes ? `<div style="margin-top: 12px; padding: 8px; background: #fffacd; border-left: 3px solid #fbbf24;">
                        <div class="field-label">Notes</div>
                        <div class="field-value">${record.patientInfo.notes}</div>
                      </div>` : ''}
                      
                      <div class="footer">
                        <div class="total">Total Dispensed: ${summariseTotals(record.items)}</div>
                        <div class="footer-note">
                          Record ID: ${record.id}<br>
                          Printed: ${new Date().toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </body>
                  </html>
                `;
                const printWindow = window.open('', '', 'width=700,height=900');
                printWindow?.document.write(receiptHtml);
                printWindow?.document.close();
                setTimeout(() => printWindow?.print(), 300);
              } catch (err) {
                console.error('Print error:', err);
                alert('Error preparing receipt for printing');
              }
            }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0">
              Print
            </button>
            <button onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Medicines expanded panel ─────────────────────────────────────────────────
function MedicinesPanel({ record }: { record: Dispensing }) {
  return (
    <div className="expand-down bg-slate-50 border-t border-slate-100">
      <div className="px-4 sm:px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Medicines & Inventory</p>
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">

          {/* Desktop table header — hidden on mobile */}
          <div className="hidden sm:grid sm:grid-cols-[2fr_1fr_1.2fr_auto] px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Medicine / Brand / Strength</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Qty</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Inventory Info</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 text-right">Status</span>
          </div>

          {record.items.map((item, i) => {
            const stockAfter = (item.stockBeforeDispense ?? 0) - item.quantity;
            const { isExpired, isExpiring } = checkMedicineStatus(item.expirationDate);
            const isLowStock = item.minStock && stockAfter <= item.minStock;

            return (
              <div key={i} className="border-b border-slate-50 last:border-0">
                {/* Mobile layout */}
                <div className="sm:hidden px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800">{item.medicineName}</p>
                        {item.prescriptionRequired && <span className="rx-badge">RX</span>}
                      </div>
                      {item.selectedStrength && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200 inline-block mt-1">{item.selectedStrength}</span>
                      )}
                      {item.brand && <p className="text-xs text-slate-400 mt-0.5">{item.brand}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-base font-bold text-slate-800">{item.quantity}</span>
                      <span className="text-xs text-slate-400 ml-1">{resolveQtyType(item)}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="space-y-0.5">
                      {item.stockBeforeDispense !== undefined && (
                        <p className="text-[10px] text-slate-500">
                          Stock: <span className="font-semibold">{item.stockBeforeDispense}</span> → <span className={`font-semibold ${isLowStock ? 'text-yellow-700' : ''}`}>{stockAfter}</span>
                        </p>
                      )}
                      {item.expirationDate && (
                        <p className="text-[10px] text-slate-500">
                          Exp: <span className={`font-semibold ${isExpired ? 'text-red-700' : isExpiring ? 'text-amber-700' : ''}`}>
                            {new Date(item.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                          </span>
                        </p>
                      )}
                    </div>
                    <div>
                      {isExpired && <span className="text-[10px] font-bold px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md inline-block">EXPIRED</span>}
                      {isExpiring && !isExpired && <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md inline-block">EXPIRING</span>}
                      {isLowStock && !isExpired && !isExpiring && <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-md inline-block">LOW</span>}
                      {!isExpired && !isExpiring && !isLowStock && <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md inline-block">OK</span>}
                    </div>
                  </div>
                </div>

                {/* Desktop layout */}
                <div className="medicine-row hidden sm:grid sm:grid-cols-[2fr_1fr_1.2fr_auto] items-start px-4 py-3 gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{item.medicineName}</p>
                      {item.prescriptionRequired && <span className="rx-badge">RX</span>}
                      {item.selectedStrength && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">{item.selectedStrength}</span>
                      )}
                    </div>
                    {item.brand && <p className="text-xs text-slate-400 mt-0.5">{item.brand}</p>}
                    {item.medicineDescription && <p className="text-[10px] text-slate-400 mt-1">{item.medicineDescription}</p>}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-slate-800">{item.quantity}</span>
                    <span className="text-xs text-slate-400 ml-1">{resolveQtyType(item)}</span>
                  </div>
                  <div className="space-y-1">
                    {item.stockBeforeDispense !== undefined && (
                      <>
                        <div className="text-[10px]"><span className="text-slate-400">Stock before:</span><span className="text-slate-700 font-semibold ml-1">{item.stockBeforeDispense}</span></div>
                        <div className="text-[10px]"><span className="text-slate-400">Stock after:</span><span className={`font-semibold ml-1 ${isLowStock ? 'text-yellow-700' : 'text-slate-700'}`}>{stockAfter}</span></div>
                      </>
                    )}
                    {item.expirationDate && (
                      <div className="text-[10px]">
                        <span className="text-slate-400">Exp:</span>
                        <span className={`font-semibold ml-1 ${isExpired ? 'text-red-700' : isExpiring ? 'text-amber-700' : 'text-slate-700'}`}>
                          {new Date(item.expirationDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    {isExpired && <span className="text-[10px] font-bold px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-md inline-block">EXPIRED</span>}
                    {isExpiring && !isExpired && <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md inline-block">EXPIRING</span>}
                    {isLowStock && !isExpired && !isExpiring && <span className="text-[10px] font-bold px-2 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-md inline-block">LOW</span>}
                    {!isExpired && !isExpiring && !isLowStock && <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md inline-block">OK</span>}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Dispensed</span>
              <span className="text-sm font-bold text-slate-800">{summariseTotals(record.items)}</span>
            </div>
          </div>
        </div>

        {!record.patientInfo && record.notes && (
          <div className="mt-3 bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Notes</p>
            <p className="text-xs text-slate-600">{record.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DispensingRecordsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [dispensings,          setDispensings]          = useState<Dispensing[]>([]);
  const [isLoadingDispensings, setIsLoadingDispensings] = useState(true);
  const [searchTerm,           setSearchTerm]           = useState('');
  const [notification,         setNotification]         = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmDelete,    setShowConfirmDelete]    = useState(false);
  const [deleteTarget,         setDeleteTarget]         = useState<string | null>(null);
  const [isProcessing,         setIsProcessing]         = useState(false);
  const [sortBy,               setSortBy]               = useState<'date-desc' | 'date-asc' | 'patient'>('date-desc');
  const [expandedId,           setExpandedId]           = useState<string | null>(null);
  const [patientModalRecord,   setPatientModalRecord]   = useState<Dispensing | null>(null);
  const [dateFrom,             setDateFrom]             = useState('');
  const [dateTo,               setDateTo]               = useState('');
  const [viewMode,             setViewMode]             = useState<ViewMode>('table');

  const currentUserLabel = user?.displayName || user?.email || user?.uid || 'Unknown';

  useEffect(() => { if (!loading && !user) router.push('/login'); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = onValue(ref(database, getUserPath(user.uid, 'dispensings')), (snap) => {
      const data = snap.val();
      setDispensings(data
        ? dedupeById(Object.entries(data as Record<string, DispensingRecord>).map(([id, v]) => ({ id, ...v })))
        : []
      );
      setIsLoadingDispensings(false);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(t);
  }, [notification]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPatientModalRecord(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filteredDispensings = dispensings.filter((d) => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      d.patientName.toLowerCase().includes(s) ||
      (d.patientId || '').toLowerCase().includes(s) ||
      d.items.some((i) => i.medicineName.toLowerCase().includes(s));
    const dt = new Date(d.date);
    return matchSearch
      && (dateFrom ? dt >= new Date(dateFrom) : true)
      && (dateTo   ? dt <= new Date(dateTo + 'T23:59:59') : true);
  });

  const sortedDispensings = [...filteredDispensings].sort((a, b) => {
    if (sortBy === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (sortBy === 'date-asc')  return new Date(a.date).getTime() - new Date(b.date).getTime();
    return a.patientName.localeCompare(b.patientName);
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsProcessing(true);
    try {
      await remove(ref(database, `dispensings/${deleteTarget}`));
      setNotification({ message: 'Record deleted successfully', type: 'success' });
      setShowConfirmDelete(false);
      if (expandedId === deleteTarget) setExpandedId(null);
      if (patientModalRecord?.id === deleteTarget) setPatientModalRecord(null);
      setDeleteTarget(null);
    } catch (err) {
      console.error(err);
      setNotification({ message: 'Failed to delete record', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading...</p>
      </div>
    </div>
  );

  const TableSkeleton = () => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden animate-pulse">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50">
        <div className="h-3 bg-slate-200 rounded-md w-full" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="px-5 py-4 border-b border-slate-50 flex items-center gap-4">
          <div className="w-8 h-8 bg-slate-100 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-slate-100 rounded w-32" />
            <div className="h-2.5 bg-slate-100 rounded w-20" />
          </div>
          <div className="h-3 bg-slate-100 rounded w-24 hidden sm:block" />
          <div className="h-3 bg-slate-100 rounded w-16 hidden md:block" />
        </div>
      ))}
    </div>
  );

  const GridSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse space-y-3">
          <div className="flex items-center gap-3"><div className="w-10 h-10 bg-slate-100 rounded-full" /><div className="flex-1 space-y-2"><div className="h-3.5 bg-slate-100 rounded w-28" /><div className="h-2.5 bg-slate-100 rounded w-20" /></div></div>
          <div className="h-px bg-slate-100" />
          <div className="space-y-2"><div className="h-3 bg-slate-100 rounded w-full" /><div className="h-3 bg-slate-100 rounded w-4/5" /></div>
        </div>
      ))}
    </div>
  );

  const ViewPatientBtn = ({ record }: { record: Dispensing }) => (
    <button
      onClick={(e) => { e.stopPropagation(); setPatientModalRecord(record); }}
      title="View full patient enrollment record"
      className="view-patient-btn flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg transition-all shrink-0 hover:bg-blue-100 whitespace-nowrap"
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      Patient
    </button>
  );

  return (
    <>
      <style jsx global>{`
        @keyframes slideUp    { from{opacity:0;transform:translateY(16px);}             to{opacity:1;transform:translateY(0);} }
        @keyframes fadeIn     { from{opacity:0;}                                         to{opacity:1;} }
        @keyframes toastIn    { from{opacity:0;transform:translateX(100%);}              to{opacity:1;transform:translateX(0);} }
        @keyframes expandDown { from{opacity:0;transform:translateY(-8px);}              to{opacity:1;transform:translateY(0);} }
        @keyframes pulse-dot  { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.4);opacity:0.7;} }
        @keyframes rowIn      { from{opacity:0;transform:translateX(-6px);}              to{opacity:1;transform:translateX(0);} }
        @keyframes cardIn     { from{opacity:0;transform:translateY(10px) scale(0.98);}  to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes modalExpand{ from{opacity:0;transform:scale(0.96) translateY(12px);}  to{opacity:1;transform:scale(1) translateY(0);} }

        .slide-up     { animation:slideUp     0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .fade-in      { animation:fadeIn      0.3s ease both; }
        .toast-in     { animation:toastIn     0.4s cubic-bezier(0.22,1,0.36,1) both; }
        .expand-down  { animation:expandDown  0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .row-in       { animation:rowIn       0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .card-in      { animation:cardIn      0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .modal-expand { animation:modalExpand 0.3s cubic-bezier(0.22,1,0.36,1) both; }

        /* ── Responsive Table ── */
        .records-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .records-table thead tr { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
        .records-table thead th { padding:10px 12px; text-align:left; font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:#94a3b8; white-space:nowrap; overflow:hidden; }
        .records-table thead th:last-child { text-align:right; }
        .records-table tbody tr { border-bottom:1px solid #f1f5f9; transition:background 0.15s ease; }
        .records-table tbody tr:last-child { border-bottom:none; }
        .records-table tbody tr:hover { background:#fafbfc; }
        .records-table tbody td { padding:12px; vertical-align:middle; overflow:hidden; }
        .table-expand-row td { padding:0 !important; }

        .col-patient  { width:35%; }
        .col-date     { width:18%; }
        .col-meds     { width:22%; }
        .col-actions  { width:25%; }

        /* Hide date column on very small screens */
        @media (max-width: 640px) {
          .col-date { display:none; }
          .col-patient { width:50%; }
          .col-meds { width:25%; }
          .col-actions { width:25%; }
        }

        .grid-card { transition:box-shadow 0.2s ease,border-color 0.2s ease,transform 0.2s ease; cursor:pointer; }
        .grid-card:hover { box-shadow:0 4px 20px rgba(0,0,0,0.07); border-color:#cbd5e1; transform:translateY(-1px); }
        .grid-card.is-expanded { border-color:#94a3b8; box-shadow:0 6px 24px rgba(0,0,0,0.09); }

        .sort-chip { transition:all 0.15s ease; cursor:pointer; }
        .sort-chip:hover { background:#f1f5f9; }
        .sort-chip.active { background:#0f172a; color:white; border-color:transparent; }

        .delete-btn { transition:all 0.15s ease; }
        .delete-btn:hover { background:#fef2f2; border-color:#fecaca; color:#dc2626; }
        .view-patient-btn { transition:all 0.15s ease; }

        .view-toggle { transition:all 0.15s ease; }
        .view-toggle.active { background:#0f172a; color:white; }
        .view-toggle:not(.active) { color:#94a3b8; }
        .view-toggle:not(.active):hover { color:#475569; background:#f1f5f9; }

        .rx-badge { font-size:9px; font-weight:800; padding:1px 5px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca; border-radius:4px; letter-spacing:0.05em; text-transform:uppercase; }

        .scroll-area::-webkit-scrollbar { width:4px; height:4px; }
        .scroll-area::-webkit-scrollbar-track { background:transparent; }
        .scroll-area::-webkit-scrollbar-thumb { background:#e2e8f0; border-radius:99px; }
        .scroll-area::-webkit-scrollbar-thumb:hover { background:#cbd5e1; }

        .patient-avatar { background:linear-gradient(135deg,#e2e8f0 0%,#cbd5e1 100%); color:#475569; font-weight:700; }
        .medicine-row { transition:background 0.15s ease; }
        .medicine-row:hover { background:#f8fafc; }
        .chevron-icon { transition:transform 0.3s cubic-bezier(0.22,1,0.36,1); color:#cbd5e1; }
        .chevron-icon.open { transform:rotate(180deg); color:#64748b; }
      `}</style>

      {isProcessing && <Processing message="Processing..." />}

      {patientModalRecord && (
        <PatientEnrollmentModal
          record={patientModalRecord}
          onClose={() => setPatientModalRecord(null)}
        />
      )}

      {notification && (
        <div className={`fixed top-5 right-5 z-[100] toast-in flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-lg border text-sm font-medium ${
          notification.type === 'success' ? 'bg-white border-emerald-200 text-emerald-800' : 'bg-white border-red-200 text-red-700'
        }`}>
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ animation: 'pulse-dot 1.5s ease infinite' }} />
          {notification.message}
        </div>
      )}

      {/* Page wrapper — respects sidebar width, no overflow */}
      <div className="min-h-screen bg-slate-50 transition-all duration-300 ml-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">

          {/* Header */}
          <div className="mb-8 sm:mb-10 slide-up">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-2">Dispensing Records</h1>
            <p className="text-sm text-slate-500">View and manage all patient dispensing history</p>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-4 slide-up" style={{ animationDelay: '0.05s' }}>
            {/* Search + View Toggle */}
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 min-w-0">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1110.5 3a7.5 7.5 0 016.15 13.65z" />
                </svg>
                <input type="text" placeholder="Search patient, ID, or medicine..."
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 transition" />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-0.5 p-1 bg-slate-100 rounded-xl shrink-0">
                {(['table', 'grid'] as const).map((mode) => (
                  <button key={mode} onClick={() => setViewMode(mode)}
                    className={`view-toggle flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${viewMode === mode ? 'active' : ''}`}>
                    {mode === 'table'
                      ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 6h18M3 14h18M3 18h18" /></svg>
                      : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                    }
                    <span className="hidden sm:inline capitalize">{mode}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sort chips */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">Sort</span>
              {([{ value: 'date-desc', label: 'Newest' }, { value: 'date-asc', label: 'Oldest' }, { value: 'patient', label: 'Patient A–Z' }] as const).map((o) => (
                <button key={o.value} onClick={() => setSortBy(o.value)}
                  className={`sort-chip text-xs font-medium px-3 py-1 rounded-full border border-slate-200 text-slate-600 ${sortBy === o.value ? 'active' : 'bg-slate-50'}`}>
                  {o.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="pt-3 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide sm:mb-2 shrink-0">Date Range</span>
                <div className="flex flex-1 items-end gap-2 flex-wrap sm:flex-nowrap">
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer" />
                  </div>
                  <span className="text-slate-300 font-medium shrink-0 pb-2">→</span>
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer" />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="shrink-0 flex items-center gap-1 px-3 py-2 text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 bg-slate-50 hover:bg-red-50 rounded-xl font-medium transition-all">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!isLoadingDispensings && (
            <p className="text-xs text-slate-400 font-medium px-1 mb-3">
              Showing <span className="text-slate-600 font-semibold">{sortedDispensings.length}</span> of {dispensings.length} records
            </p>
          )}

          {/* ── TABLE VIEW ── */}
          {viewMode === 'table' && (
            isLoadingDispensings ? <TableSkeleton /> :
            sortedDispensings.length === 0 ? <EmptyState searchTerm={searchTerm} onClear={() => setSearchTerm('')} /> : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden slide-up">
                {/* No horizontal scroll wrapper — table uses fixed layout */}
                <table className="records-table">
                  <thead>
                    <tr>
                      <th className="col-patient">Patient</th>
                      <th className="col-date">Date</th>
                      <th className="col-meds">Medicines</th>
                      <th className="col-actions" style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDispensings.map((record, idx) => {
                      const isExpanded = expandedId === record.id;
                      const pi = record.patientInfo;
                      return (
                        <Fragment key={record.id}>
                          <tr className="row-in" style={{ animationDelay: `${idx * 0.025}s` }}>
                            {/* Patient */}
                            <td className="col-patient">
                              <div className="flex items-center gap-2.5">
                                <div className="patient-avatar w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs">
                                  {record.patientName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 truncate">{record.patientName}</p>
                                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                    {record.patientId && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md">{record.patientId}</span>
                                    )}
                                    {pi?.sex && <span className="text-[10px] text-slate-400 hidden sm:inline">{pi.sex}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Date — hidden on mobile via CSS */}
                            <td className="col-date">
                              <p className="text-xs font-medium text-slate-700">{formatDateShort(record.date)}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {new Date(record.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                              </p>
                            </td>

                            {/* Medicines */}
                            <td className="col-meds">
                              <div className="flex flex-wrap gap-1">
                                {record.items.slice(0, 2).map((item, i) => (
                                  <span key={i} className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 truncate max-w-[80px]">
                                    {item.medicineName}
                                  </span>
                                ))}
                                {record.items.length > 2 && (
                                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">+{record.items.length - 2}</span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="col-actions">
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                <ViewPatientBtn record={record} />
                                <button
                                  onClick={() => setExpandedId(isExpanded ? null : record.id)}
                                  title={isExpanded ? 'Collapse' : 'Expand medicines'}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all shrink-0"
                                >
                                  <svg className={`w-3.5 h-3.5 chevron-icon ${isExpanded ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                                </button>
                                <button
                                  onClick={() => { setDeleteTarget(record.id); setShowConfirmDelete(true); }}
                                  title="Delete"
                                  className="delete-btn w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition-all shrink-0"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="table-expand-row">
                              <td colSpan={4}><MedicinesPanel record={record} /></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── GRID VIEW ── */}
          {viewMode === 'grid' && (
            isLoadingDispensings ? <GridSkeleton /> :
            sortedDispensings.length === 0 ? <EmptyState searchTerm={searchTerm} onClear={() => setSearchTerm('')} /> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {sortedDispensings.map((record, idx) => {
                  const isExpanded = expandedId === record.id;
                  const pi = record.patientInfo;
                  return (
                    <div key={record.id}
                      className={`grid-card bg-white rounded-2xl border border-slate-200 overflow-hidden card-in ${isExpanded ? 'is-expanded' : ''}`}
                      style={{ animationDelay: `${idx * 0.04}s` }}>

                      <button className="w-full text-left px-4 pt-4 pb-3" onClick={() => setExpandedId(isExpanded ? null : record.id)}>
                        <div className="flex items-start gap-3">
                          <div className="patient-avatar w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm mt-0.5">
                            {record.patientName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-bold text-slate-900 truncate">{record.patientName}</p>
                              <svg className={`chevron-icon w-3.5 h-3.5 shrink-0 ${isExpanded ? 'open' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {record.patientId && <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md">{record.patientId}</span>}
                              {pi?.sex && <span className="text-[10px] text-slate-400">{pi.sex}</span>}
                            </div>
                          </div>
                        </div>
                      </button>

                      <div className="px-4 pb-3 grid grid-cols-3 gap-2">
                        {[
                          { val: record.items.length, lbl: 'Meds' },
                          { val: record.items.reduce((s, i) => s + i.quantity, 0), lbl: [...new Set(record.items.map(resolveQtyType))].slice(0, 2).join(' & ') },
                          { val: new Date(record.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), lbl: 'Date' },
                        ].map((s, i) => (
                          <div key={i} className="bg-slate-50 rounded-xl px-2 py-2 text-center border border-slate-100">
                            <p className="text-sm font-black text-slate-800 leading-tight truncate">{s.val}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5 truncate">{s.lbl}</p>
                          </div>
                        ))}
                      </div>

                      <div className="px-4 pb-3 flex flex-wrap gap-1">
                        {record.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100 truncate max-w-[90px]">{item.medicineName}</span>
                        ))}
                        {record.items.length > 3 && <span className="text-[10px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">+{record.items.length - 3}</span>}
                      </div>

                      <div className="px-4 pb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          <span className="text-[10px] font-mono text-slate-500 truncate">{record.dispensedBy}</span>
                          {record.dispensedBy === currentUserLabel && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-md shrink-0">You</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <ViewPatientBtn record={record} />
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(record.id); setShowConfirmDelete(true); }}
                            className="delete-btn flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 border border-slate-200 bg-white rounded-lg transition-all"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete
                          </button>
                        </div>
                      </div>

                      {isExpanded && <MedicinesPanel record={record} />}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={showConfirmDelete}
        title="Delete Record?"
        message="Are you sure you want to delete this dispensing record? This action cannot be undone."
        confirmText="Delete" cancelText="Cancel" isDangerous={true}
        onConfirm={handleDelete}
        onCancel={() => { setShowConfirmDelete(false); setDeleteTarget(null); }}
      />
    </>
  );
}

function EmptyState({ searchTerm, onClear }: { searchTerm: string; onClear: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
      <svg className="w-12 h-12 text-slate-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      <p className="text-slate-400 font-medium text-sm">{searchTerm ? 'No records match your search' : 'No dispensing records yet'}</p>
      {searchTerm && <button onClick={onClear} className="mt-3 text-xs text-blue-600 hover:underline font-medium">Clear search</button>}
    </div>
  );
}
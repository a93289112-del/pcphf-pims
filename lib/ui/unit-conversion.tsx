'use client';

import { useState } from 'react';

const PRESET_UNITS = [
  'Pieces', 'Tablets', 'Nebules', 'Sachets', 'Capsules',
  'Ampules', 'Vials', 'ml', 'mg', 'Units',
] as const;

export type ConversionUnit = typeof PRESET_UNITS[number] | string;

export interface UnitConversion {
  packagingUnit:    string;
  conversionUnit:   ConversionUnit;
  conversionFactor: number;
  customUnitName?:  string;
}

interface UnitConversionProps {
  packagingUnit:      string;
  conversion:         UnitConversion | null;
  onConversionChange: (conversion: UnitConversion | null) => void;
  isDisabled?:        boolean;
}

const STORAGE_KEY = 'pims_custom_units';

function loadCustomUnits(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCustomUnits(units: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(units));
}

export default function UnitConversion({
  packagingUnit,
  conversion,
  onConversionChange,
  isDisabled = false,
}: UnitConversionProps) {
  const [customUnits,      setCustomUnits]      = useState<string[]>(loadCustomUnits);
  const [showAddCustom,    setShowAddCustom]    = useState(false);
  const [customUnitInput,  setCustomUnitInput]  = useState('');
  const [addError,         setAddError]         = useState('');

  const allUnits = [...PRESET_UNITS, ...customUnits];

  // ── Add a new custom unit to the persistent list ──────────────────────────
  const handleAddCustomUnit = () => {
    const trimmed = customUnitInput.trim();
    if (!trimmed) {
      setAddError('Unit name cannot be empty.');
      return;
    }
    const duplicate = allUnits.some(
      (u) => u.toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setAddError('This unit already exists.');
      return;
    }
    const updated = [...customUnits, trimmed];
    setCustomUnits(updated);
    saveCustomUnits(updated);
    setCustomUnitInput('');
    setAddError('');
    setShowAddCustom(false);

    // Auto-select the newly created unit
    onConversionChange({
      packagingUnit,
      conversionUnit:   trimmed,
      conversionFactor: conversion?.conversionFactor || 1,
    });
  };

  // ── Remove a custom unit from the persistent list ─────────────────────────
  const handleRemoveCustomUnit = (unit: string) => {
    const updated = customUnits.filter((u) => u !== unit);
    setCustomUnits(updated);
    saveCustomUnits(updated);
    // If the removed unit was selected, clear the conversion
    if (conversion?.conversionUnit === unit) {
      onConversionChange(null);
    }
  };

  // ── Select a unit ─────────────────────────────────────────────────────────
  const handleUnitSelect = (unit: string) => {
    if (!unit) {
      onConversionChange(null);
      return;
    }
    onConversionChange({
      packagingUnit,
      conversionUnit:   unit,
      conversionFactor: conversion?.conversionFactor || 1,
    });
  };

  // ── Update conversion factor ──────────────────────────────────────────────
  const handleFactorChange = (factor: string) => {
    const numFactor = parseInt(factor) || 0;
    if (conversion) {
      onConversionChange({ ...conversion, conversionFactor: numFactor });
    }
  };

  const isCustomUnit = (unit: string) => !PRESET_UNITS.includes(unit as typeof PRESET_UNITS[number]);

  return (
    <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">

      {/* Header */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Convert to Individual Units
        </label>
        <p className="text-xs text-slate-600">
          Optional: Define how many pieces/units are in each{' '}
          <span className="font-semibold">{packagingUnit || 'unit'}</span>
        </p>
      </div>

      {/* Unit Grid */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Select Unit Type
        </p>
        <div className="flex flex-wrap gap-2">

          {/* Preset units */}
          {PRESET_UNITS.map((unit) => (
            <button
              key={unit}
              type="button"
              disabled={isDisabled || !packagingUnit}
              onClick={() => handleUnitSelect(unit)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                conversion?.conversionUnit === unit
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {unit}
            </button>
          ))}

          {/* Custom units */}
          {customUnits.map((unit) => (
            <div key={unit} className="relative group">
              <button
                type="button"
                disabled={isDisabled || !packagingUnit}
                onClick={() => handleUnitSelect(unit)}
                className={`pl-3 pr-7 py-1.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  conversion?.conversionUnit === unit
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {unit}
              </button>
              {/* Remove custom unit */}
              <button
                type="button"
                disabled={isDisabled}
                onClick={(e) => { e.stopPropagation(); handleRemoveCustomUnit(unit); }}
                title={`Remove "${unit}"`}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors disabled:hidden ${
                  conversion?.conversionUnit === unit
                    ? 'text-blue-200 hover:text-white hover:bg-blue-500'
                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
                }`}
              >
                ×
              </button>
            </div>
          ))}

          {/* + Add Custom Unit button */}
          <button
            type="button"
            disabled={isDisabled || !packagingUnit}
            onClick={() => { setShowAddCustom((p) => !p); setAddError(''); setCustomUnitInput(''); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 ${
              showAddCustom
                ? 'bg-slate-100 text-slate-700 border-slate-400'
                : 'bg-white text-slate-500 border-dashed border-slate-300 hover:border-blue-400 hover:text-blue-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Custom
          </button>

        </div>
      </div>

      {/* Add Custom Unit Inline Form */}
      {showAddCustom && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">New Custom Unit</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customUnitInput}
              onChange={(e) => { setCustomUnitInput(e.target.value); setAddError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomUnit(); } if (e.key === 'Escape') { setShowAddCustom(false); } }}
              placeholder="e.g., Suppositories, Drops, Patches"
              autoFocus
              disabled={isDisabled}
              className="flex-1 px-3 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400"
            />
            <button
              type="button"
              onClick={handleAddCustomUnit}
              disabled={isDisabled || !customUnitInput.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setShowAddCustom(false); setAddError(''); setCustomUnitInput(''); }}
              className="px-3 py-2 text-sm text-slate-600 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
          {addError && (
            <p className="text-xs text-red-600 font-medium">{addError}</p>
          )}
          <p className="text-[11px] text-slate-400">
            Custom units are saved for future use. Hover a custom unit to remove it.
          </p>
        </div>
      )}

      {/* Conversion Factor Input */}
      {conversion?.conversionUnit && (
        <div>
          <label
            htmlFor="conversionFactor"
            className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2"
          >
            How many <span className="text-slate-700">{conversion.conversionUnit}</span> per{' '}
            <span className="text-slate-700">{packagingUnit}</span>?
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600 whitespace-nowrap">
              1 {packagingUnit} =
            </span>
            <input
              id="conversionFactor"
              type="number"
              min="1"
              value={conversion.conversionFactor || ''}
              onChange={(e) => handleFactorChange(e.target.value)}
              placeholder="e.g. 100"
              disabled={isDisabled}
              className="w-28 px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm placeholder-slate-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <span className="text-sm font-medium text-slate-600">
              {conversion.conversionUnit}
            </span>
          </div>
        </div>
      )}

      {/* Summary pill */}
      {conversion?.conversionUnit && conversion.conversionFactor > 0 && (
        <div className="flex items-center gap-2 p-3 bg-white border border-blue-200 rounded-lg text-sm">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-slate-700">
            <span className="font-semibold">1 {packagingUnit}</span>
            {' = '}
            <span className="font-bold text-blue-600">{conversion.conversionFactor} {conversion.conversionUnit}</span>
            {isCustomUnit(conversion.conversionUnit) && (
              <span className="ml-2 text-[11px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200">
                custom
              </span>
            )}
          </span>
        </div>
      )}

    </div>
  );
}
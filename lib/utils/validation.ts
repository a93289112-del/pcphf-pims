'use strict';

/**
 * Input Validation Utility
 * Provides comprehensive validation for common fields in the pharmacy system
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

// ─── Quantity & Numeric Validation ─────────────────────────────────────────────

/**
 * Validates medicine quantity (stock)
 * Must be a non-negative integer between 0 and 999,999
 */
export function validateQuantity(value: unknown): ValidationResult {
    const num = Number(value);
    if (!Number.isInteger(num)) {
        return { valid: false, error: 'Quantity must be a whole number' };
    }
    if (num < 0) {
        return { valid: false, error: 'Quantity cannot be negative' };
    }
    if (num > 999999) {
        return { valid: false, error: 'Quantity cannot exceed 999,999' };
    }
    return { valid: true };
}

/**
 * Validates price/cost (currency)
 * Must be positive number with up to 2 decimal places
 */
export function validatePrice(value: unknown): ValidationResult {
    const num = Number(value);
    if (isNaN(num)) {
        return { valid: false, error: 'Price must be a valid number' };
    }
    if (num < 0) {
        return { valid: false, error: 'Price cannot be negative' };
    }
    if (num > 999999.99) {
        return { valid: false, error: 'Price exceeds maximum allowed' };
    }
    // Check decimal places
    if (!Number.isInteger(num * 100)) {
        return { valid: false, error: 'Price can have at most 2 decimal places' };
    }
    return { valid: true };
}

/**
 * Validates conversion factor (e.g., pieces per unit)
 * Must be a positive number
 */
export function validateConversionFactor(value: unknown): ValidationResult {
    const num = Number(value);
    if (isNaN(num) || num <= 0) {
        return { valid: false, error: 'Conversion factor must be a positive number' };
    }
    if (num > 999999) {
        return { valid: false, error: 'Conversion factor exceeds maximum' };
    }
    return { valid: true };
}

// ─── Text Field Validation ─────────────────────────────────────────────────────

/**
 * Validates text fields (names, descriptions, etc.)
 * Must be non-empty and not exceed max length
 */
export function validateTextField(value: unknown, maxLength = 255, fieldName = 'Field'): ValidationResult {
    const text = String(value || '').trim();
    if (!text) {
        return { valid: false, error: `${fieldName} is required` };
    }
    if (text.length > maxLength) {
        return { valid: false, error: `${fieldName} cannot exceed ${maxLength} characters` };
    }
    // Check for potentially harmful patterns
    if (/<script|javascript:|on\w+=/i.test(text)) {
        return { valid: false, error: `${fieldName} contains invalid characters` };
    }
    return { valid: true };
}

/**
 * Validates medicine name/brand
 */
export function validateMedicineName(value: unknown): ValidationResult {
    return validateTextField(value, 200, 'Medicine name');
}

/**
 * Validates patient name
 */
export function validatePatientName(value: unknown): ValidationResult {
    return validateTextField(value, 100, 'Name');
}

/**
 * Validates contact number
 * Should be numeric and reasonable length
 */
export function validateContactNumber(value: unknown): ValidationResult {
    const text = String(value || '').trim();
    if (!text) {
        return { valid: false, error: 'Contact number is required' };
    }
    if (!/^[\d\s\-+()]+$/.test(text)) {
        return { valid: false, error: 'Contact number contains invalid characters' };
    }
    if (text.replace(/\D/g, '').length < 7) {
        return { valid: false, error: 'Contact number must be at least 7 digits' };
    }
    if (text.length > 20) {
        return { valid: false, error: 'Contact number is too long' };
    }
    return { valid: true };
}

// ─── Date Validation ────────────────────────────────────────────────────────────

/**
 * Validates expiration date format (YYYY-MM-DD)
 * Must be in future or today
 */
export function validateExpirationDate(value: unknown): ValidationResult {
    const dateStr = String(value || '').trim();
    if (!dateStr) {
        return { valid: false, error: 'Expiration date is required' };
    }

    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { valid: false, error: 'Expiration date must be in YYYY-MM-DD format' };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return { valid: false, error: 'Expiration date is invalid' };
    }

    // Check if date is in past (allowing today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(dateStr);
    expDate.setHours(0, 0, 0, 0);

    if (expDate < today) {
        return { valid: false, error: 'Expiration date cannot be in the past' };
    }

    return { valid: true };
}

/**
 * Validates date of birth (format YYYY-MM-DD)
 * Must be in past and reasonable age
 */
export function validateDateOfBirth(value: unknown): ValidationResult {
    const dateStr = String(value || '').trim();
    if (!dateStr) {
        return { valid: false, error: 'Date of birth is required' };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return { valid: false, error: 'Date of birth must be in YYYY-MM-DD format' };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return { valid: false, error: 'Date of birth is invalid' };
    }

    const today = new Date();
    if (date > today) {
        return { valid: false, error: 'Date of birth cannot be in the future' };
    }

    const age = today.getFullYear() - date.getFullYear();
    if (age > 150) {
        return { valid: false, error: 'Date of birth results in impossible age' };
    }

    return { valid: true };
}

// ─── Selection/Enum Validation ─────────────────────────────────────────────────

/**
 * Validates that value is one of allowed options
 */
export function validateEnum<T extends string | number>(
    value: unknown,
    allowedValues: T[],
    fieldName = 'Field'
): ValidationResult {
    if (!allowedValues.includes(value as T)) {
        return { valid: false, error: `${fieldName} must be one of: ${allowedValues.join(', ')}` };
    }
    return { valid: true };
}

// ─── Batch Operations Validation ───────────────────────────────────────────────

/**
 * Validates medicine batch for stock adjustment
 */
export function validateMedicineBatch(batch: unknown): ValidationResult {
    if (!batch || typeof batch !== 'object') {
        return { valid: false, error: 'Invalid batch data' };
    }

    const b = batch as Record<string, unknown>;

    if (typeof b.quantity !== 'number' || b.quantity < 0) {
        return { valid: false, error: 'Batch quantity must be non-negative' };
    }

    if (typeof b.expirationDate !== 'string') {
        return { valid: false, error: 'Batch expiration date is required' };
    }

    const expResult = validateExpirationDate(b.expirationDate);
    if (!expResult.valid) {
        return expResult;
    }

    return { valid: true };
}

// ─── Safe Type Coercion ───────────────────────────────────────────────────────

/**
 * Safely convert value to integer, throwing if invalid
 */
export function toSafeInteger(value: unknown): number {
    const result = validateQuantity(value);
    if (!result.valid) {
        throw new Error(result.error);
    }
    return Math.floor(Number(value));
}

/**
 * Safely convert value to price, throwing if invalid
 */
export function toSafePrice(value: unknown): number {
    const result = validatePrice(value);
    if (!result.valid) {
        throw new Error(result.error);
    }
    return Number(value);
}

/**
 * Safely convert value to non-empty string, throwing if invalid
 */
export function toSafeString(value: unknown, maxLength = 255): string {
    const result = validateTextField(value, maxLength);
    if (!result.valid) {
        throw new Error(result.error);
    }
    return String(value).trim();
}

/**
 * Safely extract date string (YYYY-MM-DD), throwing if invalid
 */
export function toSafeDate(value: unknown): string {
    const dateStr = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        throw new Error('Invalid date format (expected YYYY-MM-DD)');
    }
    return dateStr;
}

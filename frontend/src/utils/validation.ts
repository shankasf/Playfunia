/**
 * Form validation utilities
 */

// Name validation: only letters, spaces, hyphens, apostrophes
export const NAME_REGEX = /^[a-zA-Z\s'-]+$/;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= 100 && NAME_REGEX.test(trimmed);
}

export function formatNameInput(value: string): string {
  // Remove any characters that aren't letters, spaces, hyphens, or apostrophes
  return value.replace(/[^a-zA-Z\s'-]/g, '');
}

// Phone validation: exactly 10 digits
export const PHONE_REGEX = /^\d{10}$/;

export function isValidPhone(phone: string): boolean {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length === 10;
}

export function formatPhoneInput(value: string): string {
  // Keep only digits, max 10
  return value.replace(/\D/g, '').slice(0, 10);
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

// Email validation
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

// Date of Birth validation
export function isValidDOB(dob: string): boolean {
  if (!dob) return false;

  const date = new Date(dob);
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  // DOB must be in the past
  if (date >= today) return false;

  // For child DOB: must be 0-18 years old
  const age = calculateAge(date);
  return age >= 0 && age <= 18;
}

export function isValidChildDOB(dob: string): boolean {
  if (!dob) return true; // DOB is often optional for children

  const date = new Date(dob);
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  if (date >= today) return false;

  // Child must be 1-13 years old
  const age = calculateAge(date);
  return age >= 1 && age <= 13;
}

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// Validation error messages
export const ValidationMessages = {
  nameRequired: 'Name is required',
  nameInvalid: 'Name can only contain letters, spaces, hyphens, and apostrophes',
  emailRequired: 'Email is required',
  emailInvalid: 'Please enter a valid email address',
  phoneRequired: 'Phone number is required',
  phoneInvalid: 'Please enter a valid 10-digit phone number',
  dobInvalid: 'Please enter a valid date of birth',
  childDobInvalid: 'Child must be between 1-13 years old',
};

// Combined validation for guest form
export function validateGuestForm(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}): { valid: boolean; error?: string } {
  if (!data.firstName.trim()) {
    return { valid: false, error: 'Please enter your first name.' };
  }
  if (!isValidName(data.firstName)) {
    return { valid: false, error: 'First name can only contain letters, spaces, hyphens, and apostrophes.' };
  }

  if (!data.lastName.trim()) {
    return { valid: false, error: 'Please enter your last name.' };
  }
  if (!isValidName(data.lastName)) {
    return { valid: false, error: 'Last name can only contain letters, spaces, hyphens, and apostrophes.' };
  }

  if (!data.email.trim()) {
    return { valid: false, error: 'Please enter your email address.' };
  }
  if (!isValidEmail(data.email)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }

  if (!data.phone.trim()) {
    return { valid: false, error: 'Please enter your phone number.' };
  }
  if (!isValidPhone(data.phone)) {
    return { valid: false, error: 'Please enter a valid 10-digit phone number.' };
  }

  return { valid: true };
}

// Child name validation
export function validateChildName(name: string): { valid: boolean; error?: string } {
  if (!name.trim()) {
    return { valid: false, error: 'Child name is required.' };
  }
  if (!isValidName(name)) {
    return { valid: false, error: 'Child name can only contain letters, spaces, hyphens, and apostrophes.' };
  }
  return { valid: true };
}

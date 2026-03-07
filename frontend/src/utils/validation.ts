/**
 * Form validation utilities
 */

// Name validation: letters (including accented), spaces, hyphens, apostrophes
export const NAME_REGEX = /^[A-Za-zÀ-ÿ\s'-]+$/;

export function isValidName(name: string, minLength = 1, maxLength = 100): boolean {
  const trimmed = name.trim();
  return trimmed.length >= minLength && trimmed.length <= maxLength && NAME_REGEX.test(trimmed);
}

export function formatNameInput(value: string): string {
  // Remove any characters that aren't letters (including accented), spaces, hyphens, or apostrophes
  return value.replace(/[^A-Za-zÀ-ÿ\s'-]/g, '');
}

// Phone validation: exactly 10 digits
export const PHONE_REGEX = /^\d{10}$/;

export function isValidPhone(phone: string): boolean {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length !== 10) return false;
  // Reject obviously invalid: all-same-digit or starts with 0/1
  if (/^(\d)\1{9}$/.test(digitsOnly)) return false;
  if (digitsOnly[0] === '0' || digitsOnly[0] === '1') return false;
  return true;
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

// Child Date of Birth validation (ages 0-13)
export function isValidDOB(dob: string): boolean {
  if (!dob) return false;

  // Parse as local time to avoid timezone shift (e.g. "2020-01-15" → midnight local, not UTC)
  const date = new Date(dob + 'T00:00:00');
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // DOB must be in the past
  if (date >= today) return false;

  // For child DOB: must be 0-13 years old
  const age = calculateAge(date);
  return age >= 0 && age <= 13;
}

export function isValidChildDOB(dob: string): boolean {
  if (!dob) return true; // DOB is often optional for children

  // Parse as local time to avoid timezone shift
  const date = new Date(dob + 'T00:00:00');
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date >= today) return false;

  // Child must be 0-13 years old
  const age = calculateAge(date);
  return age >= 0 && age <= 13;
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

// Password validation
export function isValidPassword(password: string): boolean {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

// Signature validation
export function isValidSignature(signature: string): boolean {
  const trimmed = signature.trim();
  return trimmed.length >= 1 && trimmed.length <= 200;
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
  childDobInvalid: 'Child must be between 0-13 years old',
  passwordInvalid: 'Password must be at least 8 characters with one uppercase, one lowercase, and one number',
  signatureInvalid: 'Signature must be between 1 and 200 characters',
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

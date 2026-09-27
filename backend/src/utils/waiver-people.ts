import { DateTime } from 'luxon';

/**
 * Who a waiver covers. Kids (0-12) and teens (13-17) are minors signed for by
 * the parent/guardian and share the same storage (waiver_user_children /
 * children); they are told apart by age. Every adult (18+) signs for themselves.
 */
export const KID_MAX_AGE = 12;
export const TEEN_MIN_AGE = 13;
export const TEEN_MAX_AGE = 17;
export const ADULT_MIN_AGE = 18;

/** Whole-year age today in New York, or null for a missing/invalid date. */
export function ageInNewYork(birthDate: string | Date | null | undefined): number | null {
  if (!birthDate) return null;
  const iso = birthDate instanceof Date ? birthDate.toISOString() : String(birthDate);
  const dob = DateTime.fromISO(iso.split('T')[0] ?? iso, { zone: 'America/New_York' });
  if (!dob.isValid) return null;
  const today = DateTime.now().setZone('America/New_York').startOf('day');
  return Math.floor(today.diff(dob, 'years').years);
}

export function isTeenBirthDate(birthDate: string | Date | null | undefined): boolean {
  const age = ageInNewYork(birthDate);
  return age !== null && age >= TEEN_MIN_AGE;
}

type WithBirthDate = { birthDate?: string | null; birth_date?: string | null };

/** Split a stored minors list into kids (0-12) and teens (13+). Missing DOBs stay with kids. */
export function splitMinorsByAge<T extends WithBirthDate>(minors: T[]): { kids: T[]; teens: T[] } {
  const kids: T[] = [];
  const teens: T[] = [];
  for (const minor of minors) {
    if (isTeenBirthDate(minor.birthDate ?? minor.birth_date)) teens.push(minor);
    else kids.push(minor);
  }
  return { kids, teens };
}

export interface AdditionalAdult {
  name: string;
  typedSignature: string;
  signatureImageUrl: string;
  signedAt: string;
}

/** Normalise the additional_adults JSONB column (tolerates null / legacy rows). */
export function parseAdditionalAdults(value: unknown): AdditionalAdult[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a) => ({
      name: String(a.name ?? '').trim(),
      typedSignature: String(a.typedSignature ?? a.name ?? '').trim(),
      signatureImageUrl: String(a.signatureImageUrl ?? ''),
      signedAt: String(a.signedAt ?? ''),
    }))
    .filter((a) => a.name.length > 0);
}

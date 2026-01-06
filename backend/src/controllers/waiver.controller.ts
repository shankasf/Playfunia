import type { Response } from 'express';
import { ZodError } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import {
  listAllWaivers,
  listWaiversForGuardian,
  listWaiversForWaiverUser,
  signWaiver,
  signWaiverForWaiverUser,
} from '../services/waiver.service';
import { signWaiverSchema } from '../schemas/waiver.schema';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export const signWaiverHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  const payload = parseWithSchema(signWaiverSchema, {
    ...req.body,
    guardianId: req.user.id,
  });

  // Handle waiver-only users differently
  if (req.user.type === 'waiver_user') {
    const waiver = await signWaiverForWaiverUser(req.user.id, payload);
    return res.status(201).json({ waiver });
  }

  // Regular user
  const waiver = await signWaiver(req.user.id, payload);
  return res.status(201).json({ waiver });
});

export const listWaiversHandler = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  // Handle waiver-only users
  if (req.user.type === 'waiver_user') {
    const waivers = await listWaiversForWaiverUser(req.user.id);
    return res.status(200).json({ waivers });
  }

  // Regular user
  const waivers = await listWaiversForGuardian(req.user.id);
  return res.status(200).json({ waivers });
});

export const exportWaiversHandler = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const waivers = await listAllWaivers();

    // Determine max children across all waivers for column count
    const maxChildren = waivers.reduce((max, w) => Math.max(max, (w.children as unknown[])?.length ?? 0), 0);

    const rows = waivers.map(waiver => {
      const guardianDob: string = waiver.guardian_date_of_birth
        ? String(waiver.guardian_date_of_birth).split('T')[0] ?? ''
        : '';
      const signedAtStr: string = waiver.date_signed || waiver.signed_at
        ? String(waiver.date_signed || waiver.signed_at)
        : '';
      const expiresAtStr: string = waiver.expires_at
        ? String(waiver.expires_at)
        : '';

      const row: Record<string, string> = {
        guardianFirstName: waiver.guardian_first_name ?? '',
        guardianLastName: waiver.guardian_last_name ?? '',
        guardianEmail: waiver.guardian_email ?? '',
        guardianPhone: waiver.guardian_phone ?? '',
        guardianDateOfBirth: guardianDob,
        relationshipToMinor: waiver.relationship_to_minor ?? '',
        guardianAccount: getPopulatedGuardianEmail(waiver.customers ?? waiver.waiver_users),
        dateSigned: signedAtStr,
        expiresAt: expiresAtStr,
        marketingSmsOptIn: waiver.marketing_sms_opt_in ? 'yes' : 'no',
        marketingEmailOptIn: waiver.marketing_email_opt_in ? 'yes' : 'no',
        digitalSignature: waiver.digital_signature ?? '',
        acceptedPolicies: Array.isArray(waiver.accepted_policies) ? waiver.accepted_policies.join('; ') : '',
      };

      // Add separate columns for each child
      const children = (waiver.children ?? []) as Array<{ name?: string; first_name?: string; last_name?: string; birthDate?: string; birth_date?: string; gender?: string }>;
      for (let i = 0; i < maxChildren; i++) {
        const child = children[i];
        const num = i + 1;
        const childName = child?.name || `${child?.first_name || ''} ${child?.last_name || ''}`.trim();
        row[`child${num}Name`] = childName ?? '';
        const childDob: string = child?.birthDate || child?.birth_date
          ? String(child.birthDate || child.birth_date).split('T')[0] ?? ''
          : '';
        row[`child${num}DOB`] = childDob;
        row[`child${num}Gender`] = child?.gender ?? '';
      }

      return row;
    });

    const csv = buildCsv(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=waivers.csv');
    return res.status(200).send(csv);
  },
);

function buildCsv(rows: Array<Record<string, string | undefined>>) {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(header => escapeCsv(row[header] ?? '')).join(','));
  }
  return lines.join('\n');
}

function escapeCsv(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function getPopulatedGuardianEmail(guardian: unknown) {
  if (guardian && typeof guardian === 'object' && 'email' in guardian) {
    const candidate = (guardian as { email?: unknown }).email;
    return typeof candidate === 'string' ? candidate : '';
  }
  return '';
}

function parseWithSchema<T>(schema: { parse: (data: unknown) => T }, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues.map(issue => issue.message).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, { cause: error });
    }
    throw error;
  }
}

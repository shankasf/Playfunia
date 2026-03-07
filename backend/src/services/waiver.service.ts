import { DateTime } from 'luxon';
import { randomBytes } from 'crypto';
import {
  UserRepository,
  CustomerRepository,
  ChildRepository,
  WaiverRepository,
  WaiverSubmissionRepository,
  WaiverUserRepository,
  WaiverVisitRepository,
} from '../repositories';
import { AppError } from '../utils/app-error';
import { publishAdminEvent } from './admin-events.service';
import { queueWaiverConfirmation } from './notification-queue.service';
import { generateWaiverPdf, type WaiverPdfData } from './waiver-pdf.service';
import { sendWaiverConfirmation } from './email.service';
import { uploadSignatureImage } from './signature-upload.service';
import { logger } from '../utils/logger';
import type { SignWaiverInput } from '../schemas/waiver.schema';
import type { WaiverConfirmationEmailData } from './email.service';
import type { WaiverSmsData } from './sms.service';

// Character set excluding ambiguous chars (0, O, I, 1, L)
const WAIVER_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const WAIVER_CODE_LENGTH = 6;

/**
 * Generate a unique 6-character alphanumeric waiver code.
 * Uses crypto.randomBytes for secure randomness and checks DB for collisions.
 */
async function generateWaiverCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = randomBytes(WAIVER_CODE_LENGTH);
    let code = '';
    for (let i = 0; i < WAIVER_CODE_LENGTH; i++) {
      code += WAIVER_CODE_CHARS[bytes[i]! % WAIVER_CODE_CHARS.length];
    }
    const exists = await WaiverRepository.findByWaiverCode(code);
    if (!exists) {
      return code;
    }
    logger.warn({ code, attempt }, 'Waiver code collision detected, retrying');
  }
  throw new AppError('Unable to generate unique waiver code', 500);
}

/**
 * Queue waiver confirmation email + SMS (fire-and-forget).
 * Generates a signed PDF and attaches it to the confirmation email.
 * Non-blocking: waiver succeeds even if notifications fail.
 */
function queueWaiverNotifications(params: {
  waiverId: number;
  waiverCode: string;
  guardianName: string;
  guardianEmail?: string;
  guardianPhone?: string;
  guardianDob?: string;
  relationshipToChildren?: string;
  children: Array<{ name: string; birthDate?: string; gender?: string }>;
  signedAt: string;
  signature: string;
  ipAddress: string;
  acceptedPolicies: string[];
  signatureImageUrl?: string;
}): void {
  const {
    waiverId, waiverCode, guardianName, guardianEmail, guardianPhone,
    guardianDob, relationshipToChildren, children, signedAt,
    signature, ipAddress, acceptedPolicies, signatureImageUrl,
  } = params;

  if (!guardianEmail && !guardianPhone) return;

  // Generate PDF and send notifications asynchronously
  // Email is sent directly (not queued) because the PDF Buffer can't be serialized to JSON in the DB queue.
  // SMS is queued normally through the notification queue.
  (async () => {
    let pdfBuffer: Buffer | undefined;

    try {
      const pdfData: WaiverPdfData = {
        guardianName,
        guardianEmail,
        guardianPhone,
        guardianDob,
        relationshipToChildren,
        children,
        signature,
        signedAt,
        ipAddress,
        waiverCode,
        acceptedPolicies,
        signatureImageUrl,
      };
      pdfBuffer = await generateWaiverPdf(pdfData);
      logger.info({ waiverId, pdfSizeBytes: pdfBuffer.length }, 'Waiver PDF generated successfully');
    } catch (err) {
      logger.error({ err, waiverId }, 'Failed to generate waiver PDF - sending email without attachment');
    }

    // Send email directly with PDF attachment (bypasses queue to preserve Buffer)
    if (guardianEmail) {
      const emailData: WaiverConfirmationEmailData = {
        email: guardianEmail,
        guardianName,
        childNames: children.map(c => c.name),
        childCount: children.length,
        signedAt,
        waiverId,
        waiverCode,
        location: 'Playfunia',
        pdfBuffer,
      };

      try {
        logger.info({ waiverId, hasPdf: !!pdfBuffer, recipientEmail: guardianEmail }, 'Sending waiver confirmation email directly');
        const sent = await sendWaiverConfirmation(emailData);
        if (!sent) {
          logger.warn({ waiverId }, 'Direct waiver email send returned false - queuing without PDF as fallback');
          // Queue without PDF as fallback
          const { pdfBuffer: _ignored, ...emailDataWithoutPdf } = emailData;
          await queueWaiverConfirmation(emailDataWithoutPdf, undefined, waiverId);
        }
      } catch (err) {
        logger.error({ err, waiverId }, 'Direct waiver email failed - queuing without PDF as fallback');
        const { pdfBuffer: _ignored, ...emailDataWithoutPdf } = emailData;
        await queueWaiverConfirmation(emailDataWithoutPdf, undefined, waiverId);
      }
    }

    // Queue SMS through normal notification queue
    if (guardianPhone) {
      const smsData: WaiverSmsData = {
        phone: guardianPhone,
        guardianName,
        childCount: children.length,
        waiverCode,
        signedAt,
      };
      await queueWaiverConfirmation(undefined, smsData, waiverId);
    }
  })().catch((err) => {
    logger.error({ err, waiverId }, 'Failed to send waiver confirmation notifications');
  });
}

/**
 * Compare waiver data to check if anything has changed
 * Uses ID-based comparison for children to handle reordering correctly
 */
function hasWaiverDataChanged(
  latestWaiver: {
    guardian_name: string;
    guardian_email?: string;
    guardian_phone?: string;
    guardian_date_of_birth?: string;
    relationship_to_children?: string;
  },
  existingChildren: Array<{ childId?: number; name: string; birth_date: string; gender?: string }>,
  input: SignWaiverInput
): boolean {
  // Compare guardian info
  if (latestWaiver.guardian_name !== input.guardianName) return true;
  if ((latestWaiver.guardian_email || '') !== (input.guardianEmail || '')) return true;
  if ((latestWaiver.guardian_phone || '') !== (input.guardianPhone || '')) return true;

  const latestDob = latestWaiver.guardian_date_of_birth?.split('T')[0] || '';
  const inputDob = input.guardianDob?.toISOString().split('T')[0] || '';
  if (latestDob !== inputDob) return true;

  if ((latestWaiver.relationship_to_children || '') !== (input.relationshipToChildren || '')) return true;

  // Compare children using ID-based matching
  const inputChildren = input.children || [];

  // Different count = data changed
  if (existingChildren.length !== inputChildren.length) return true;

  // Build a map of existing children by childId for O(1) lookup
  const existingByChildId = new Map<number, { name: string; birth_date: string; gender?: string }>();
  for (const child of existingChildren) {
    if (child.childId) {
      existingByChildId.set(child.childId, child);
    }
  }

  // Check each input child
  for (const inputChild of inputChildren) {
    // If input child has no childId, it's new (data changed)
    if (!inputChild.childId) return true;

    const existing = existingByChildId.get(inputChild.childId);
    // If childId not found in existing, data changed
    if (!existing) return true;

    // Compare child data
    if (existing.name !== inputChild.name) return true;
    const existingBirthDate = existing.birth_date?.split('T')[0] || '';
    const inputBirthDate = inputChild.birthDate?.toISOString().split('T')[0] || '';
    if (existingBirthDate !== inputBirthDate) return true;
    if ((existing.gender || '') !== (inputChild.gender || '')) return true;
  }

  return false;
}

/**
 * Sign waiver for a main user (has User account).
 */
export async function signWaiver(guardianId: string, input: SignWaiverInput, ipAddress: string = 'unknown') {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) {
    throw new AppError('Invalid guardian ID', 400);
  }

  // Validate guardian name
  if (!input.guardianName || !input.guardianName.trim()) {
    throw new AppError('Guardian name is required', 400);
  }

  const guardian = await UserRepository.findById(userId);
  if (!guardian) {
    throw new AppError('Guardian not found', 404);
  }

  let customerId = guardian.customer_id;
  
  // If guardian has no customer record, find existing or create one
  if (!customerId) {
    // First check if a customer already exists with this email
    let existingCustomer = null;
    if (guardian.email) {
      existingCustomer = await CustomerRepository.findByEmail(guardian.email);
    }
    
    if (existingCustomer) {
      // Use existing customer
      customerId = existingCustomer.customer_id;
    } else {
      // Create new customer
      const fullName = [guardian.first_name, guardian.last_name].filter(Boolean).join(' ').trim() || 'Guardian';
      const newCustomer = await CustomerRepository.create({
        full_name: fullName,
        email: guardian.email,
        phone: guardian.phone,
      });
      customerId = newCustomer.customer_id;
    }
    
    // Update user with the customer_id
    await UserRepository.update(userId, { customer_id: customerId });
  }

  const childIds: number[] = [];

  try {
    // Get all existing children for this customer
    const existingChildren = await ChildRepository.findByCustomerId(customerId);
    const processedChildIds: number[] = [];

    // Process each child from input
    for (const child of input.children) {
      const { firstName, lastName } = splitName(child.name);
      if (!firstName || !firstName.trim()) {
        throw new AppError('Each child must include a first name.', 400);
      }

      // Validate birth date before converting
      if (!child.birthDate || isNaN(child.birthDate.getTime())) {
        throw new AppError('Each child must have a valid birth date.', 400);
      }

      const birthDateStr = child.birthDate.toISOString().split('T')[0];

      let childRecord;

      if (child.childId) {
        // Update existing child by ID
        const existing = existingChildren.find(c => c.child_id === child.childId);
        if (existing) {
          childRecord = await ChildRepository.update(existing.child_id, {
            first_name: firstName,
            last_name: lastName,
            birth_date: birthDateStr,
            gender: child.gender,
          });
          processedChildIds.push(existing.child_id);
        } else {
          // Child ID provided but not found - create new
          childRecord = await ChildRepository.create({
            customer_id: customerId,
            first_name: firstName,
            last_name: lastName,
            birth_date: birthDateStr,
            gender: child.gender,
          });
        }
      } else {
        // No childId - create new child
        childRecord = await ChildRepository.create({
          customer_id: customerId,
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDateStr,
          gender: child.gender,
        });
      }

      childIds.push(childRecord.child_id);
    }

    // Delete children that are no longer in the waiver
    for (const existingChild of existingChildren) {
      if (!processedChildIds.includes(existingChild.child_id)) {
        await ChildRepository.delete(existingChild.child_id);
      }
    }

    const archiveUntil = DateTime.now().plus({ years: 7 }).toISO();
    const waiverCode = await generateWaiverCode();

    // Upload signature image to Supabase Storage if provided
    let signatureImageUrl: string | undefined;
    if (input.signatureImage) {
      signatureImageUrl = (await uploadSignatureImage(input.signatureImage, 0)) ?? undefined;
    }

    // Create waiver submission with child_ids
    const waiver = await WaiverRepository.create({
      customer_id: customerId,
      guardian_name: input.guardianName,
      guardian_email: input.guardianEmail,
      guardian_phone: input.guardianPhone,
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      relationship_to_children: input.relationshipToChildren,
      child_ids: childIds,
      signature: input.signature,
      accepted_policies: input.acceptedPolicies,
      marketing_opt_in: input.marketingOptIn ?? false,
      archive_until: archiveUntil ?? undefined,
      waiver_code: waiverCode,
      ip_address: ipAddress,
      signature_image_url: signatureImageUrl,
    });

    publishAdminEvent('waiver.updated', {
      guardianId,
      waiverId: waiver.waiver_submission_id,
      signedAt: waiver.signed_at,
    });

    // Queue confirmation notifications with PDF (fire-and-forget)
    queueWaiverNotifications({
      waiverId: waiver.waiver_submission_id,
      waiverCode: waiver.waiver_code ?? waiverCode,
      guardianName: input.guardianName,
      guardianEmail: input.guardianEmail,
      guardianPhone: input.guardianPhone,
      guardianDob: input.guardianDob?.toISOString().split('T')[0],
      relationshipToChildren: input.relationshipToChildren,
      children: input.children.map(c => ({ name: c.name, birthDate: c.birthDate?.toISOString(), gender: c.gender })),
      signedAt: waiver.signed_at,
      signature: input.signature,
      ipAddress,
      acceptedPolicies: input.acceptedPolicies,
      signatureImageUrl,
    });

    return {
      id: waiver.waiver_submission_id,
      guardianName: waiver.guardian_name,
      guardianEmail: waiver.guardian_email,
      guardianPhone: waiver.guardian_phone,
      waiverCode: waiver.waiver_code ?? waiverCode,
      children: input.children.map((child, index) => ({
        name: child.name,
        birthDate: child.birthDate.toISOString(),
        gender: child.gender,
        childId: childIds[index],
      })),
      signedAt: waiver.signed_at,
      signature: waiver.signature,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "We couldn't save the waiver right now. Please try again in a moment.",
      500,
      { cause: error },
    );
  }
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  const [firstNameRaw, ...rest] = parts;
  const firstName = firstNameRaw ?? '';
  const lastName = rest.length > 0 ? rest.join(' ') : undefined;
  return { firstName, lastName };
}

/**
 * Transform waiver submission from snake_case (DB) to camelCase (API)
 * Children are fetched from waiver_user_children table, not JSONB
 */
function transformWaiverSubmission(waiver: Record<string, unknown>) {
  // Children may come from the join (waiver_user_children) or be resolved separately
  const children = Array.isArray(waiver.children) ? waiver.children : [];

  return {
    id: waiver.submission_id ?? waiver.waiver_submission_id,
    guardianName: waiver.guardian_name ?? (waiver.guardian_first_name ? `${waiver.guardian_first_name} ${waiver.guardian_last_name || ''}`.trim() : null),
    guardianFirstName: waiver.guardian_first_name ?? null,
    guardianLastName: waiver.guardian_last_name ?? null,
    guardianEmail: waiver.guardian_email ?? null,
    guardianPhone: waiver.guardian_phone ?? null,
    guardianDateOfBirth: waiver.guardian_date_of_birth ?? null,
    relationshipToChildren: waiver.relationship_to_children ?? waiver.relationship_to_minor ?? null,
    relationshipToMinor: waiver.relationship_to_minor ?? waiver.relationship_to_children ?? null,
    childIds: waiver.child_ids || [],
    children: children.map((c: Record<string, unknown>) => ({
      childId: c.childId ?? c.waiver_user_child_id ?? c.child_id ?? undefined,
      name: c.name ?? (`${c.first_name || ''} ${c.last_name || ''}`.trim() || null),
      birthDate: c.birthDate ?? c.birth_date ?? null,
      gender: c.gender ?? null,
    })),
    signature: waiver.digital_signature ?? waiver.signature ?? null,
    digitalSignature: waiver.digital_signature ?? null,
    signedAt: waiver.signed_at,
    dateSigned: waiver.date_signed ?? waiver.signed_at,
    expiresAt: waiver.expires_at ?? null,
    archiveUntil: waiver.archive_until ?? null,
    marketingOptIn: waiver.marketing_opt_in ?? false,
    marketingSmsOptIn: waiver.marketing_sms_opt_in ?? false,
    marketingEmailOptIn: waiver.marketing_email_opt_in ?? false,
    acceptedPolicies: waiver.accepted_policies || [],
    waiverCode: waiver.waiver_code ?? waiver.waiverCode ?? null,
  };
}

export async function listWaiversForGuardian(guardianId: string) {
  const userId = parseInt(guardianId, 10);
  if (isNaN(userId)) return [];

  const user = await UserRepository.findById(userId);
  if (!user) return [];

  // Try to find waivers by customer_id first
  let waivers: Array<Record<string, unknown>> = [];
  if (user.customer_id) {
    waivers = await WaiverRepository.findByCustomerId(user.customer_id);
  }

  // If no waivers found by customer_id, also search by email
  // This handles cases where waiver was signed before account creation
  if (waivers.length === 0 && user.email) {
    waivers = await WaiverRepository.findByEmail(user.email);
  }

  // Resolve child_ids to actual children data for main-account waivers
  // (waiver_user waivers already have children from the join)
  if (user.customer_id && waivers.length > 0) {
    const allChildren = await ChildRepository.findByCustomerId(user.customer_id);
    const childMap = new Map(allChildren.map(c => [c.child_id, c]));

    for (const waiver of waivers) {
      if (!Array.isArray(waiver.children) || waiver.children.length === 0) {
        const childIds = Array.isArray(waiver.child_ids) ? waiver.child_ids as number[] : [];
        waiver.children = childIds
          .map(id => childMap.get(id))
          .filter(Boolean)
          .map(c => ({
            name: `${c!.first_name || ''} ${c!.last_name || ''}`.trim(),
            birthDate: c!.birth_date,
            gender: c!.gender,
          }));
      }
    }
  }

  return waivers.map(transformWaiverSubmission);
}

export async function listAllWaivers() {
  return WaiverRepository.findAll({ limit: 100 });
}

/**
 * List waivers for a waiver-only user (transformed to camelCase)
 * Also checks for waivers signed by main account users with matching email/phone
 */
export async function listWaiversForWaiverUser(waiverUserId: string) {
  const waiverUserIdNum = parseInt(waiverUserId, 10);
  if (isNaN(waiverUserIdNum)) return [];

  const waiverUser = await WaiverUserRepository.findById(waiverUserIdNum);
  if (!waiverUser) {
    return [];
  }

  // Get waivers signed directly by this waiver user
  const waiverUserWaivers = await WaiverRepository.findByWaiverUserId(waiverUserIdNum);

  // Also check for waivers signed by main account with matching email
  // This allows main account users to see their existing waivers when using waiver auth
  let mainAccountWaivers: Awaited<ReturnType<typeof WaiverRepository.findByGuardianEmail>> = [];
  if (waiverUser.email) {
    mainAccountWaivers = await WaiverRepository.findByGuardianEmail(waiverUser.email);
  } else if (waiverUser.phone) {
    // If only phone, check by phone number in guardian_phone field
    mainAccountWaivers = await WaiverRepository.findByGuardianPhone(waiverUser.phone);
  }

  // Combine and deduplicate by waiver_id
  const allWaivers = [...waiverUserWaivers, ...mainAccountWaivers];
  const uniqueWaivers = allWaivers.filter(
    (waiver, index, self) => index === self.findIndex((w) => w.waiver_id === waiver.waiver_id)
  );

  // Sort by signed_at descending (most recent first)
  uniqueWaivers.sort((a, b) => {
    const dateA = a.signed_at ? new Date(a.signed_at).getTime() : 0;
    const dateB = b.signed_at ? new Date(b.signed_at).getTime() : 0;
    return dateB - dateA;
  });

  // Attach waiver user's children to each waiver record if children are missing
  // (waiver_submissions query doesn't join waiver_user_children)
  const waiverUserChildren = waiverUser.waiver_user_children || [];
  const childrenMapped = waiverUserChildren.map((c: Record<string, unknown>) => ({
    childId: c.waiver_user_child_id as number | undefined,
    name: `${c.minor_first_name || ''} ${c.minor_last_name || ''}`.trim(),
    birthDate: c.minor_date_of_birth as string || '',
    birth_date: c.minor_date_of_birth as string || '',
    gender: c.minor_gender as string || '',
  }));

  return uniqueWaivers.map((waiver) => {
    // If waiver has no children from the query, attach the waiver user's children
    const transformed = transformWaiverSubmission(waiver);
    if (!transformed.children || transformed.children.length === 0) {
      transformed.children = childrenMapped;
    }
    return transformed;
  });
}

/**
 * Sign waiver for a waiver-only user (no main account).
 * Stores guardian details in WaiverUser and creates a waiver record.
 * If quickResign is true and data hasn't changed, only records a visit.
 */
export async function signWaiverForWaiverUser(
  waiverUserId: string,
  input: SignWaiverInput,
  ipAddress: string = 'unknown',
  tokenContext?: { email?: string; phone?: string },
) {
  let waiverUser;

  if (waiverUserId === 'pending') {
    // New user — create waiver_users record now at submission time (not at login)
    const email = tokenContext?.email?.toLowerCase() || input.guardianEmail?.toLowerCase();
    const phone = tokenContext?.phone || input.guardianPhone;
    if (!email && !phone) {
      throw new AppError('Email or phone is required', 400);
    }

    // Check if another user was created in the meantime (race condition)
    let existing = null;
    if (email) existing = await WaiverUserRepository.findByEmail(email);
    if (!existing && phone) existing = await WaiverUserRepository.findByPhone(phone);

    if (existing) {
      waiverUser = existing;
    } else {
      waiverUser = await WaiverUserRepository.create({
        email,
        phone,
        marketing_opt_in: false,
      });
    }
  } else {
    const waiverUserIdNum = parseInt(waiverUserId, 10);
    if (isNaN(waiverUserIdNum)) {
      throw new AppError('Invalid waiver user ID', 400);
    }

    waiverUser = await WaiverUserRepository.findById(waiverUserIdNum);
    if (!waiverUser) {
      throw new AppError('Waiver user not found', 404);
    }
  }

  try {
    // Fetch existing children from waiver_user_children for comparison (with childId)
    const existingChildrenRaw = waiverUser.waiver_user_children || [];
    const existingChildren = existingChildrenRaw.map((c: Record<string, unknown>) => ({
      childId: c.waiver_user_child_id as number | undefined,
      name: `${c.minor_first_name || ''} ${c.minor_last_name || ''}`.trim(),
      birth_date: c.minor_date_of_birth as string || '',
      gender: c.minor_gender as string | undefined,
    }));

    // Check if this is a quick re-sign with unchanged data
    if (input.quickResign) {
      const existingWaivers = await WaiverRepository.findByWaiverUserId(waiverUser.waiver_user_id);
      const latestWaiver = existingWaivers[0];

      if (latestWaiver && !hasWaiverDataChanged(latestWaiver, existingChildren, input)) {
        // Data hasn't changed - record the visit and update timestamps
        const visitSignedAt = new Date().toISOString();

        await WaiverUserRepository.update(waiverUser.waiver_user_id, {
          last_waiver_signed_at: visitSignedAt,
        });

        // Update the submission's date_signed so "Last signed" reflects the latest sign
        await WaiverSubmissionRepository.update(latestWaiver.waiver_submission_id, {
          date_signed: visitSignedAt,
        });

        // Record the visit linked to the existing waiver
        await WaiverVisitRepository.create({
          waiver_user_id: waiverUser.waiver_user_id,
          waiver_submission_id: latestWaiver.waiver_submission_id,
        });

        publishAdminEvent('waiver.visit_recorded', {
          waiverUserId,
          waiverId: latestWaiver.waiver_submission_id,
          visitedAt: visitSignedAt,
          dataChanged: false,
        });

        // Ensure waiver has a code (backfill if missing from old records)
        let waiverCode = latestWaiver.waiver_code ?? '';
        if (!waiverCode) {
          waiverCode = await generateWaiverCode();
          await WaiverSubmissionRepository.update(latestWaiver.waiver_submission_id, { waiver_code: waiverCode });
        }

        // Queue confirmation notifications with PDF (fire-and-forget) - always send on every sign
        queueWaiverNotifications({
          waiverId: latestWaiver.waiver_submission_id,
          waiverCode,
          guardianName: latestWaiver.guardian_name,
          guardianEmail: latestWaiver.guardian_email,
          guardianPhone: latestWaiver.guardian_phone,
          guardianDob: latestWaiver.guardian_date_of_birth,
          relationshipToChildren: latestWaiver.relationship_to_children,
          children: existingChildren.map((c: { name: string; birth_date: string; gender?: string }) => ({
            name: c.name, birthDate: c.birth_date, gender: c.gender,
          })),
          signedAt: visitSignedAt,
          signature: latestWaiver.signature || input.signature,
          ipAddress,
          acceptedPolicies: latestWaiver.accepted_policies || input.acceptedPolicies,
          signatureImageUrl: latestWaiver.signature_image_url,
        });

        // Return existing children from waiver_user_children table
        return {
          id: latestWaiver.waiver_submission_id,
          guardianName: latestWaiver.guardian_name,
          guardianEmail: latestWaiver.guardian_email,
          guardianPhone: latestWaiver.guardian_phone,
          waiverCode,
          children: existingChildren.map((c: { name: string; birth_date: string; gender?: string }) => ({
            name: c.name,
            birthDate: c.birth_date,
            gender: c.gender,
          })),
          signedAt: visitSignedAt, // Current visit time
          signature: latestWaiver.signature,
          quickResign: true,
          dataChanged: false,
        };
      }
    }

    // Data has changed or not a quick re-sign - create new waiver record
    // If this was a quick re-sign that fell through (data changed), preserve the
    // previous signature image URL when no new signature image was provided
    let previousSignatureImageUrl: string | undefined;
    if (input.quickResign && !input.signatureImage) {
      const existingWaivers = await WaiverRepository.findByWaiverUserId(waiverUser.waiver_user_id);
      previousSignatureImageUrl = existingWaivers[0]?.signature_image_url ?? undefined;
    }

    // Update WaiverUser with guardian details (using new schema column names)
    const { firstName: guardianFirstName, lastName: guardianLastName } = splitName(input.guardianName);
    if (!guardianFirstName || !guardianFirstName.trim()) {
      throw new AppError('Guardian name is required', 400);
    }
    const updateData: Record<string, unknown> = {
      guardian_first_name: guardianFirstName,
      guardian_last_name: guardianLastName || '',
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      marketing_opt_in: input.marketingOptIn ?? false,
      last_waiver_signed_at: new Date().toISOString(),
    };

    if (input.relationshipToChildren) updateData.relationship_to_minor = input.relationshipToChildren;

    // Only update email/phone on waiver_users if they don't already have one set.
    // Changing the auth lookup email/phone would orphan the account —
    // the guardian_email on the waiver_submission record captures any updated contact info.
    if (input.guardianEmail && !waiverUser.email) {
      updateData.guardian_email = input.guardianEmail.toLowerCase();
    }
    if (input.guardianPhone && !waiverUser.phone) {
      updateData.guardian_phone = input.guardianPhone;
    }

    await WaiverUserRepository.update(waiverUser.waiver_user_id, updateData);

    // Validate children have names and birth dates
    const validChildren = input.children.filter(child => child.birthDate);
    for (const child of validChildren) {
      if (!child.name || !child.name.trim()) {
        throw new AppError('Child name is required', 400);
      }
    }
    if (validChildren.length === 0) {
      throw new AppError('At least one child with name and birth date is required', 400);
    }

    // Update children (with childId for proper CRUD operations)
    await WaiverUserRepository.updateChildren(
      waiverUser.waiver_user_id,
      validChildren.map((child) => ({
        childId: child.childId,
        name: child.name,
        birth_date: child.birthDate?.toISOString().split('T')[0] ?? '',
        gender: child.gender,
      }))
    );

    const archiveUntil = DateTime.now().plus({ years: 7 }).toISO();
    const waiverCode = await generateWaiverCode();

    // Upload signature image to Supabase Storage if provided, or reuse previous
    let signatureImageUrl: string | undefined;
    if (input.signatureImage) {
      signatureImageUrl = (await uploadSignatureImage(input.signatureImage, 0)) ?? undefined;
    } else if (previousSignatureImageUrl) {
      signatureImageUrl = previousSignatureImageUrl;
    }

    // Create waiver submission record (no JSONB children - stored in waiver_user_children)
    const waiver = await WaiverRepository.create({
      waiver_user_id: waiverUser.waiver_user_id,
      guardian_name: input.guardianName,
      guardian_email: input.guardianEmail,
      guardian_phone: input.guardianPhone,
      guardian_date_of_birth: input.guardianDob?.toISOString().split('T')[0],
      relationship_to_children: input.relationshipToChildren,
      signature: input.signature,
      accepted_policies: input.acceptedPolicies,
      marketing_opt_in: input.marketingOptIn ?? false,
      archive_until: archiveUntil ?? undefined,
      waiver_code: waiverCode,
      ip_address: ipAddress,
      signature_image_url: signatureImageUrl,
    });

    // Record the visit linked to the new waiver
    await WaiverVisitRepository.create({
      waiver_user_id: waiverUser.waiver_user_id,
      waiver_submission_id: waiver.waiver_submission_id,
    });

    publishAdminEvent('waiver.updated', {
      waiverUserId,
      waiverId: waiver.waiver_submission_id,
      signedAt: waiver.signed_at,
      dataChanged: true,
    });

    // Queue confirmation notifications with PDF (fire-and-forget)
    queueWaiverNotifications({
      waiverId: waiver.waiver_submission_id,
      waiverCode: waiver.waiver_code ?? waiverCode,
      guardianName: input.guardianName,
      guardianEmail: input.guardianEmail,
      guardianPhone: input.guardianPhone,
      guardianDob: input.guardianDob?.toISOString().split('T')[0],
      relationshipToChildren: input.relationshipToChildren,
      children: input.children.map(c => ({ name: c.name, birthDate: c.birthDate?.toISOString(), gender: c.gender })),
      signedAt: waiver.signed_at,
      signature: input.signature,
      ipAddress,
      acceptedPolicies: input.acceptedPolicies,
      signatureImageUrl,
    });

    return {
      id: waiver.waiver_submission_id,
      guardianName: waiver.guardian_name,
      guardianEmail: waiver.guardian_email,
      guardianPhone: waiver.guardian_phone,
      waiverCode: waiver.waiver_code ?? waiverCode,
      children: input.children.map((child) => ({
        name: child.name,
        birthDate: child.birthDate.toISOString(),
        gender: child.gender,
      })),
      signedAt: waiver.signed_at,
      signature: waiver.signature,
      quickResign: input.quickResign ?? false,
      dataChanged: true,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "We couldn't save the waiver right now. Please try again in a moment.",
      500,
      { cause: error },
    );
  }
}

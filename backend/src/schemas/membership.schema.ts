import { z } from 'zod';

export const purchaseMembershipSchema = z.object({
  membershipId: z.string().min(1),
  durationMonths: z.number().int().positive().max(24).default(1),
  autoRenew: z.boolean().optional(),
  refundPolicyAccepted: z.boolean().optional(),
  refundPolicyAcceptedAt: z.string().datetime().optional(),
  referralName: z.string().trim().max(100).optional(),
});

export type PurchaseMembershipInput = z.infer<typeof purchaseMembershipSchema>;

export const membershipUserParamSchema = z.object({
  userId: z.string().min(1),
});

export type MembershipUserParamInput = z.infer<typeof membershipUserParamSchema>;

export const recordMembershipVisitSchema = z.object({
  note: z.string().trim().max(200).optional(),
});

export type RecordMembershipVisitInput = z.infer<typeof recordMembershipVisitSchema>;

export const checkInSchema = z.object({
  childrenCount: z.number().int().min(0).default(0),
  adultsCount: z.number().int().min(0).default(0),
  notes: z.string().trim().max(200).optional(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;

export const matchReferralSchema = z.object({
  staffUserId: z.number().int().positive(),
});

export type MatchReferralInput = z.infer<typeof matchReferralSchema>;

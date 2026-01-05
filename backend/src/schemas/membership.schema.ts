import { z } from 'zod';

export const purchaseMembershipSchema = z.object({
  membershipId: z.string().min(1),
  durationMonths: z.number().int().positive().max(24).default(1),
  autoRenew: z.boolean().optional(),
});

export type PurchaseMembershipInput = z.infer<typeof purchaseMembershipSchema>;

export const membershipUserParamSchema = z.object({
  userId: z.string().min(1),
});

export type MembershipUserParamInput = z.infer<typeof membershipUserParamSchema>;

export const recordMembershipVisitSchema = z.object({
  note: z.string().max(200).optional(),
});

export type RecordMembershipVisitInput = z.infer<typeof recordMembershipVisitSchema>;


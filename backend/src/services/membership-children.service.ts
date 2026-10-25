/**
 * Children covered by a membership.
 *
 * A membership covers at most its plan's max_children. Covered children are the
 * ones linked in membership_children (picked at checkout or by staff); if fewer
 * are linked than the plan allows (e.g. memberships created before linking
 * existed), the remaining slots are filled from the customer's other children,
 * photo first and then oldest record, so the list is stable and never exceeds
 * capacity.
 */

import { supabaseAny } from '../config/supabase';
import { ChildRepository } from '../repositories';
import { AppError } from '../utils/app-error';

export interface CoveredChild {
  id: number;
  firstName: string;
  lastName: string | null;
  birthDate: string | null;
  photoUrl: string | null;
  /** Explicitly linked to the membership (vs. filling an unassigned slot) */
  linked: boolean;
}

type ChildRow = {
  child_id: number;
  first_name: string;
  last_name?: string | null;
  birth_date?: string | null;
  photo_url?: string | null;
  created_at?: string | null;
};

function toCovered(c: ChildRow, linked: boolean): CoveredChild {
  return {
    id: c.child_id,
    firstName: c.first_name,
    lastName: c.last_name ?? null,
    birthDate: c.birth_date ?? null,
    photoUrl: c.photo_url ?? null,
    linked,
  };
}

function pickCovered(children: ChildRow[], linkedIds: Set<number>, maxChildren: number): CoveredChild[] {
  const linked = children.filter(c => linkedIds.has(c.child_id)).slice(0, maxChildren);
  const fill = children
    .filter(c => !linkedIds.has(c.child_id))
    .sort((a, b) => Number(Boolean(b.photo_url)) - Number(Boolean(a.photo_url))
      || (a.created_at ?? '').localeCompare(b.created_at ?? '')
      || a.child_id - b.child_id)
    .slice(0, Math.max(0, maxChildren - linked.length));
  return [...linked.map(c => toCovered(c, true)), ...fill.map(c => toCovered(c, false))];
}

async function getLinkedChildIds(membershipIds: number[]): Promise<Map<number, Set<number>>> {
  const byMembership = new Map<number, Set<number>>();
  if (membershipIds.length === 0) return byMembership;
  const { data, error } = await supabaseAny
    .from('membership_children')
    .select('membership_id, child_id')
    .in('membership_id', membershipIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ membership_id: number; child_id: number }>) {
    if (!byMembership.has(row.membership_id)) byMembership.set(row.membership_id, new Set());
    byMembership.get(row.membership_id)!.add(row.child_id);
  }
  return byMembership;
}

export async function getCoveredChildren(membership: { membership_id: number; customer_id: number | null }, maxChildren: number): Promise<CoveredChild[]> {
  if (!membership.customer_id) return [];
  const [children, linked] = await Promise.all([
    ChildRepository.findByCustomerId(membership.customer_id),
    getLinkedChildIds([membership.membership_id]),
  ]);
  return pickCovered(children, linked.get(membership.membership_id) ?? new Set(), maxChildren);
}

/** Batch version for rosters: one children query and one link query in total. */
export async function getCoveredChildrenForMany(
  memberships: Array<{ membership_id: number; customer_id: number | null; maxChildren: number }>,
): Promise<Map<number, CoveredChild[]>> {
  const customerIds = Array.from(new Set(memberships.map(m => m.customer_id).filter((id): id is number => typeof id === 'number')));
  const [childrenResult, linked] = await Promise.all([
    customerIds.length > 0
      ? supabaseAny.from('children').select('*').in('customer_id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    getLinkedChildIds(memberships.map(m => m.membership_id)),
  ]);
  if (childrenResult.error) throw childrenResult.error;
  const childrenByCustomer = new Map<number, ChildRow[]>();
  for (const child of (childrenResult.data ?? []) as Array<ChildRow & { customer_id: number }>) {
    const list = childrenByCustomer.get(child.customer_id) ?? [];
    list.push(child);
    childrenByCustomer.set(child.customer_id, list);
  }

  const result = new Map<number, CoveredChild[]>();
  for (const m of memberships) {
    const children = m.customer_id ? childrenByCustomer.get(m.customer_id) ?? [] : [];
    result.set(m.membership_id, pickCovered(children, linked.get(m.membership_id) ?? new Set(), m.maxChildren));
  }
  return result;
}

/**
 * Replace the children linked to a membership. Rejects more children than the
 * plan covers and children from another customer's account.
 */
export async function setCoveredChildren(
  membership: { membership_id: number; customer_id: number | null },
  childIds: number[],
  maxChildren: number,
): Promise<void> {
  const uniqueIds = Array.from(new Set(childIds));
  if (uniqueIds.length > maxChildren) {
    throw new AppError(`This plan covers ${maxChildren} child${maxChildren === 1 ? '' : 'ren'}; ${uniqueIds.length} were selected.`, 400);
  }
  if (uniqueIds.length > 0) {
    const children = await ChildRepository.findByIds(uniqueIds);
    if (children.length !== uniqueIds.length || children.some(c => c.customer_id !== membership.customer_id)) {
      throw new AppError('Selected child does not belong to this membership\'s account.', 403);
    }
  }

  const { error: deleteError } = await supabaseAny
    .from('membership_children')
    .delete()
    .eq('membership_id', membership.membership_id);
  if (deleteError) throw deleteError;
  if (uniqueIds.length === 0) return;

  const { error: insertError } = await supabaseAny
    .from('membership_children')
    .insert(uniqueIds.map(child_id => ({ membership_id: membership.membership_id, child_id })));
  if (insertError) throw insertError;
}

/** Link one more child, if the membership has room. Returns false when full. */
export async function addCoveredChild(
  membership: { membership_id: number; customer_id: number | null },
  childId: number,
  maxChildren: number,
): Promise<boolean> {
  const linked = (await getLinkedChildIds([membership.membership_id])).get(membership.membership_id) ?? new Set<number>();
  if (linked.has(childId)) return true;
  if (linked.size >= maxChildren) return false;
  await setCoveredChildren(membership, [...linked, childId], maxChildren);
  return true;
}

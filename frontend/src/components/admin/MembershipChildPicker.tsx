import { useEffect, useState } from 'react';

import { fetchAccountChildrenByEmail, type AdminAccountChild } from '../../api/admin';

type Props = {
  email: string;
  /** Children the plan covers */
  maxChildren: number;
  /** Slots already used elsewhere (e.g. a new child typed into the form) */
  reservedSlots?: number;
  selected: number[];
  onChange: (childIds: number[]) => void;
};

/**
 * Checkbox list of the children on an account, limited to the plan's capacity,
 * so staff pick exactly which kids a membership covers.
 */
export function MembershipChildPicker({ email, maxChildren, reservedSlots = 0, selected, onChange }: Props) {
  const [children, setChildren] = useState<AdminAccountChild[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setChildren([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      fetchAccountChildrenByEmail(trimmed)
        .then(list => { if (!cancelled) setChildren(list); })
        .catch(() => { if (!cancelled) setChildren([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [email]);

  const capacity = Math.max(0, maxChildren - reservedSlots);
  const full = selected.length >= capacity;

  if (loading) return <small style={{ color: '#6b7280' }}>Looking up children on this account…</small>;
  if (children.length === 0) return null;

  return (
    <div>
      <small style={{ color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
        Children on this account — pick up to {capacity} covered by this plan ({selected.length}/{capacity} selected)
      </small>
      {children.map(child => {
        const checked = selected.includes(child.id);
        return (
          <label key={child.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && full}
              onChange={() => onChange(checked ? selected.filter(id => id !== child.id) : [...selected, child.id])}
            />
            {child.firstName} {child.lastName ?? ''}
            {child.birthDate ? <span style={{ color: '#6b7280' }}> · {child.birthDate}</span> : null}
            {!child.hasPhoto ? <span style={{ color: '#b45309' }}> · no photo</span> : null}
          </label>
        );
      })}
    </div>
  );
}

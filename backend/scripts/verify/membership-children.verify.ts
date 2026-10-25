/**
 * Verifies membership child coverage is capped at plan capacity, using an
 * in-memory stand-in for the database (no Supabase access).
 * Run from backend/: npx tsx scripts/verify/membership-children.verify.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import assert from 'node:assert/strict';
import path from 'node:path';

const children = [
  { child_id: 1, customer_id: 10, first_name: 'Ava', photo_url: null, created_at: '2026-01-01' },
  { child_id: 2, customer_id: 10, first_name: 'Ben', photo_url: 'p/ben.jpg', created_at: '2026-02-01' },
  { child_id: 3, customer_id: 10, first_name: 'Cy', photo_url: null, created_at: '2026-03-01' },
  { child_id: 9, customer_id: 99, first_name: 'Other', photo_url: null, created_at: '2026-01-01' },
];
let links: Array<{ membership_id: number; child_id: number }> = [];

const fakeSupabase = {
  from(table: string) {
    assert.equal(table, 'membership_children');
    const filters: Array<(r: any) => boolean> = [];
    let op = 'select';
    let payload: any;
    const b: any = {
      select() { return b; },
      delete() { op = 'delete'; return b; },
      insert(v: any) { op = 'insert'; payload = v; return b; },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return b; },
      in(c: string, v: any[]) { filters.push(r => v.includes(r[c])); return b; },
      then(res: any) {
        if (op === 'insert') { links.push(...payload); return Promise.resolve({ error: null }).then(res); }
        if (op === 'delete') { links = links.filter(r => !filters.every(f => f(r))); return Promise.resolve({ error: null }).then(res); }
        return Promise.resolve({ data: links.filter(r => filters.every(f => f(r))), error: null }).then(res);
      },
    };
    return b;
  },
};

const src = path.resolve(__dirname, '../../src');
const stub = (rel: string, exports: any) => {
  const file = require.resolve(path.join(src, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports } as any;
};
stub('config/supabase', { supabase: fakeSupabase, supabaseAny: fakeSupabase });
stub('repositories/index', {
  ChildRepository: {
    findByCustomerId: async (cid: number) => children.filter(c => c.customer_id === cid),
    findByIds: async (ids: number[]) => children.filter(c => ids.includes(c.child_id)),
  },
});

const svc = require(path.join(src, 'services/membership-children.service'));
const mini = { membership_id: 100, customer_id: 10 };

(async () => {
  // The reported bug: 3 kids on the account, Mini Plan covers 1
  let covered = await svc.getCoveredChildren(mini, 1);
  assert.equal(covered.length, 1, 'unlinked Mini membership must show 1 child, not 3');
  assert.equal(covered[0].firstName, 'Ben', 'fills with the child that has a photo first');
  assert.equal(covered[0].linked, false);

  // Linked child wins over fill order
  await svc.setCoveredChildren(mini, [3], 1);
  covered = await svc.getCoveredChildren(mini, 1);
  assert.deepEqual(covered.map((c: any) => [c.firstName, c.linked]), [['Cy', true]]);

  // Over capacity rejected
  await assert.rejects(svc.setCoveredChildren(mini, [1, 2], 1), /covers 1 child/);
  // Another account's child rejected
  await assert.rejects(svc.setCoveredChildren(mini, [9], 1), /does not belong/);
  assert.deepEqual(links, [{ membership_id: 100, child_id: 3 }], 'failed updates leave links unchanged');

  // addCoveredChild refuses when full, accepts when room
  assert.equal(await svc.addCoveredChild(mini, 1, 1), false);
  const superPlan = { membership_id: 200, customer_id: 10 };
  assert.equal(await svc.addCoveredChild(superPlan, 1, 2), true);
  covered = await svc.getCoveredChildren(superPlan, 2);
  assert.deepEqual(covered.map((c: any) => c.firstName), ['Ava', 'Ben'], 'linked first, then fill to capacity');

  // Batch roster version matches
  const many = await svc.getCoveredChildrenForMany([{ ...mini, maxChildren: 1 }, { ...superPlan, maxChildren: 2 }]);
  assert.equal(many.get(100).length, 1);
  assert.equal(many.get(200).length, 2);

  console.log('membership children: all assertions passed');
})().catch(e => { console.error(e); process.exit(1); });

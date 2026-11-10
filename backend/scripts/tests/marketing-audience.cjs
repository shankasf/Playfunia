// Run: node scripts/tests/marketing-audience.cjs
// Uses fake contacts and senders; never contacts Twilio, SES, or Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const tables = {
  customers: [{ email: 'signup@example.com', phone: '5185550100' }],
  children: [],
  waiver_user_children: [],
  waiver_users: [{ guardian_email: 'legacy@example.com', guardian_phone: '5185550102', marketing_opt_in: true }],
  waiver_submissions: [
    ...Array.from({ length: 500 }, (_, i) => ({ guardian_email: `filler${i}@example.com` })),
    { guardian_email: 'yes@example.com', guardian_phone: '5185550101', accepted_policies: ['marketing_sms_consent_v1'] },
    { guardian_email: 'duplicate@example.com', guardian_phone: '+15185550101', accepted_policies: ['marketing_sms_consent_v1'] },
    { guardian_email: 'transactional@example.com', guardian_phone: '5185550103', marketing_sms_opt_in: true },
  ],
};
const sent = [];
const campaigns = [];
const config = { marketingSmsEnabled: true };
let failedTable;
const db = {
  from(table) {
    const q = {
      select() { return q; },
      order() { return q; },
      async range(first, last) {
        return failedTable === table
          ? { error: new Error('Unavailable') }
          : { data: (tables[table] || []).slice(first, last + 1) };
      },
      insert(row) { if (table === 'marketing_campaigns') campaigns.push(row); return q; },
      async single() { return { data: { campaign_id: 1 } }; },
      update() { return q; },
      eq() { return q; },
    };
    return q;
  },
};
const mocks = {
  '../config/env': { appConfig: config },
  '../config/supabase': { supabaseAny: db },
  '../utils/app-error': { AppError: class extends Error {} },
  '../utils/logger': { logger: { info() {}, error() {} } },
  './email.service': { sendMarketingEmail() { throw new Error('Unexpected email'); } },
  './email-validation.service': { validateEmailsBulk: async () => new Map() },
  './event-image.service': {},
  './sms.service': { sendMarketingSms: async (phone) => { sent.push(phone); return { success: true }; } },
};
const file = path.resolve(__dirname, '../../src/services/marketing.service.ts');
const m = new Module(file, module);
m.filename = file;
m.paths = Module._nodeModulePaths(path.dirname(file));
const originalRequire = m.require.bind(m);
m.require = (id) => mocks[id] || originalRequire(id);
m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, file);

(async () => {
  const { previewAudience, sendCampaign } = m.exports;
  const preview = await previewAudience([], 'sms');
  assert.equal(preview.smsCount, 1, 'Consent beyond the first page is included and duplicate phones are merged');
  assert.equal(preview.recipients[0].phone, '5185550101');
  const input = { channel: 'sms', smsBody: 'Test', promoCodes: [], months: [1], allContacts: true, isTest: false };
  const result = await sendCampaign(input);
  assert.equal(result.sent, 1, 'All subscribers includes consented contacts without birthday data');
  assert.deepEqual(sent, ['5185550101'], 'Signup, transactional consent, and legacy general consent do not enroll SMS');
  assert.deepEqual(campaigns[0].birthday_months, []);
  await assert.rejects(sendCampaign({ ...input, selectedKeys: [] }), /No opted-in recipients/);
  await assert.rejects(sendCampaign({ ...input, allContacts: false, months: [] }), /Choose all marketing subscribers/);
  await assert.rejects(sendCampaign({ ...input, allContacts: false }), /No opted-in recipients/);
  config.marketingSmsEnabled = false;
  await assert.rejects(sendCampaign(input), /SMS marketing is paused/);
  failedTable = 'waiver_submissions';
  await assert.rejects(previewAudience([], 'sms'), /Unable to load the marketing audience/);
  assert.equal(sent.length, 1, 'Rejected requests send nothing');
  console.log('PASS: pagination, explicit SMS consent, phone deduplication, all subscribers, birthday filtering, empty selection, pause switch, and failed audience reads.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

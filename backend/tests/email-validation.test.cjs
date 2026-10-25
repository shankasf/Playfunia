const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const dns = require('node:dns');
const { SESv2Client } = require('@aws-sdk/client-sesv2');

const servicePath = require.resolve('../src/services/email-validation.service');
const configPath = require.resolve('../src/config/env');
const dbPath = require.resolve('../src/config/supabase');
const loggerPath = require.resolve('../src/utils/logger');

function setup({ verdict = 'HIGH', threshold = 'MEDIUM', disabled = false, failure = false, suppressed = false, missingCredentials = false } = {}) {
  delete require.cache[servicePath];
  require.cache[configPath] = { exports: { appConfig: {
    awsAccessKeyId: missingCredentials ? undefined : 'test', awsSecretAccessKey: missingCredentials ? undefined : 'test', awsRegion: 'us-east-1',
    sesEmailValidationEnabled: !disabled, sesEmailValidationThreshold: threshold,
  } } };
  const query = {
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    maybeSingle: async () => ({ data: suppressed ? { email: 'blocked@gmail.com' } : null }),
    range: async () => ({ data: [] }), upsert: async () => ({ error: null }),
    then(resolve) { return Promise.resolve({ count: 0 }).then(resolve); },
  };
  require.cache[dbPath] = { exports: { supabaseAny: { from: () => query } } };
  require.cache[loggerPath] = { exports: { logger: { warn() {}, info() {} } } };
  mock.method(dns.promises.Resolver.prototype, 'resolveMx', async () => [{ exchange: 'mx.example.com', priority: 10 }]);
  const insights = [];
  mock.method(SESv2Client.prototype, 'send', async (command) => {
    switch (command.constructor.name) {
      case 'GetSuppressedDestinationCommand': throw Object.assign(new Error('Not found'), { name: 'NotFoundException' });
      case 'ListSuppressedDestinationsCommand': return { SuppressedDestinationSummaries: [] };
      case 'GetEmailAddressInsightsCommand':
        insights.push(command.input.EmailAddress);
        if (failure) throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' });
        return { MailboxValidation: { IsValid: { ConfidenceVerdict: verdict }, Evaluations: {
          IsRoleAddress: { ConfidenceVerdict: 'HIGH' }, IsDisposable: { ConfidenceVerdict: 'LOW' },
        } } };
      default: throw new Error(`Unexpected command ${command.constructor.name}`);
    }
  });
  return { service: require(servicePath), insights };
}

afterEach(() => mock.restoreAll());

for (const verdict of ['HIGH', 'MEDIUM']) {
  test(`accepts ${verdict} validity, even for a role address`, async () => {
    const { service, insights } = setup({ verdict });
    assert.deepEqual(await service.validateEmailAddress(' INFO@GMAIL.COM '), { ok: true, email: 'info@gmail.com' });
    assert.equal(insights.length, 1);
  });
}

test('rejects LOW validity and uses a meaningful campaign label', async () => {
  const { service } = setup({ verdict: 'LOW' });
  assert.equal((await service.validateEmailAddress('invalid@gmail.com')).reason, 'low_confidence');
  assert.equal(service.describeRejectReason('low_confidence'), 'Low delivery confidence');
  await assert.rejects(service.assertDeliverableEmail('invalid@gmail.com'), { statusCode: 400 });
});

test('HIGH threshold rejects MEDIUM validity', async () => {
  const { service } = setup({ verdict: 'MEDIUM', threshold: 'HIGH' });
  assert.equal((await service.validateEmailAddress('medium@gmail.com')).reason, 'low_confidence');
});

for (const options of [{ failure: true }, { verdict: null }, { verdict: 'UNKNOWN' }, { missingCredentials: true }]) {
  test(`unavailable validation defers sends and returns HTTP 503: ${JSON.stringify(options)}`, async () => {
    const { service } = setup(options);
    assert.equal((await service.validateEmailAddress('retry@gmail.com')).reason, 'validation_unavailable');
    await assert.rejects(service.assertDeliverableEmail('retry@gmail.com'), { statusCode: 503 });
  });
}

test('caches and coalesces repeated validation calls', async () => {
  const { service, insights } = setup();
  await Promise.all(Array.from({ length: 5 }, () => service.validateEmailAddress('same@gmail.com')));
  await service.validateEmailAddress('same@gmail.com');
  assert.equal(insights.length, 1);
});

test('bulk validation checks each unique eligible recipient and shares the single-address cache', async () => {
  const { service, insights } = setup({ verdict: 'LOW' });
  const results = await service.validateEmailsBulk(['one@gmail.com', 'ONE@gmail.com', 'two@gmail.com', 'bad@gamil.com', 'broken']);
  assert.equal(results.size, 4);
  assert.equal(results.get('one@gmail.com').reason, 'low_confidence');
  assert.equal(results.get('two@gmail.com').reason, 'low_confidence');
  assert.equal(results.get('bad@gamil.com').reason, 'typo_domain');
  assert.equal(results.get('broken').reason, 'syntax');
  await service.validateEmailAddress('one@gmail.com');
  assert.deepEqual(insights.sort(), ['one@gmail.com', 'two@gmail.com']);
});

test('does not call the paid API for locally suppressed or malformed addresses', async () => {
  const { service, insights } = setup({ suppressed: true });
  assert.equal((await service.validateEmailAddress('blocked@gmail.com')).reason, 'suppressed');
  assert.equal((await service.validateEmailAddress('broken')).reason, 'syntax');
  assert.equal(insights.length, 0);
});

test('explicit disable switch retains the existing checks without insights calls', async () => {
  const { service, insights } = setup({ disabled: true });
  assert.equal((await service.validateEmailAddress('valid@gmail.com')).ok, true);
  assert.equal(insights.length, 0);
});

test('transient API failures are retried on the next validation, not cached as invalid', async () => {
  const { service, insights } = setup({ failure: true });
  await service.validateEmailAddress('retry@gmail.com');
  await service.validateEmailAddress('retry@gmail.com');
  assert.equal(insights.length, 2);
});

test('bulk API failures are marked unavailable so campaigns skip those sends', async () => {
  const { service } = setup({ failure: true });
  const results = await service.validateEmailsBulk(['retry@gmail.com']);
  assert.equal(results.get('retry@gmail.com').reason, 'validation_unavailable');
});

test('expired cached verdicts are revalidated', async () => {
  const { service, insights } = setup();
  await service.validateEmailAddress('refresh@gmail.com');
  const later = Date.now() + 25 * 60 * 60 * 1000;
  mock.method(Date, 'now', () => later);
  await service.validateEmailAddress('refresh@gmail.com');
  assert.equal(insights.length, 2);
});

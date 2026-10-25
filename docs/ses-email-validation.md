# SES Email Validation

The backend uses [`GetEmailAddressInsights`](https://docs.aws.amazon.com/ses/latest/dg/email-validation-api.html)
after syntax, typo-domain, DNS and suppression checks. It runs for collected
addresses, outgoing recipients (including BCC), campaign previews and bulk sends.

`SES_EMAIL_VALIDATION_ENABLED=true` is the default. Configure `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` and `AWS_REGION` in the root `.env`; SMTP credentials are
separate. The AWS identity requires `ses:GetEmailAddressInsights` on `*`, in addition
to the existing `ses:GetSuppressedDestination` and `ses:ListSuppressedDestinations`
permissions. AWS documents `iam:CreateServiceLinkedRole` for initial CloudWatch
metrics setup; provision this administratively rather than granting broad IAM
permissions to the application.

`SES_EMAIL_VALIDATION_THRESHOLD=MEDIUM` accepts HIGH and MEDIUM overall validity
and rejects LOW. HIGH can be selected to accept only HIGH. These are confidence
assessments, not a guarantee of delivery. Role addresses are not independently
rejected: HIGH `IsRoleAddress` is not HIGH invalidity.

Successful responses (including LOW verdicts) are cached in process for 24 hours,
up to 10,000 addresses. Concurrent checks for the same address share one request.
Bulk calls run at most three validation lookups concurrently. Each insights call
has an eight-second timeout; AWS SDK retries apply within that limit. API calls
incur AWS validation charges; the cache is cleared on process restart and is not
shared between replicas.

Missing credentials, access denial, throttling, timeouts and incomplete responses
defer sending. Forms receive HTTP 503 with a retry message; campaigns record the
recipient as skipped with an unavailable reason. Such failures are not cached or
added to the suppression list. Skipped campaign recipients are not automatically
retried. `SES_EMAIL_VALIDATION_ENABLED=false` restores the prior checks as an
operational rollback.

This integration uses API validation. It does not change account-wide
[`Auto Validation`](https://docs.aws.amazon.com/ses/latest/dg/email-validation-auto.html)
settings, which can affect other applications sharing the AWS account. Deploy or
restart the backend to load code/configuration changes.

Verification:

```sh
cd backend
npm run typecheck
node --require ts-node/register --test tests/email-validation.test.cjs
```

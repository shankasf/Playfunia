# Separate Playfunia SES invoice

Last verified: 2026-10-21 UTC.

## Provisioned resources

| Resource | Value |
| --- | --- |
| Organization | `o-6gkla33432` |
| Management/payer account | `689517798275` |
| Dedicated Playfunia account | `643600677615` |
| Invoice unit | `Playfunia-SES` |
| Invoice unit ARN | `arn:aws:invoicing::689517798275:invoice-unit/8rm6hy8r` |
| Invoice receiver and sole linked account | `643600677615` |
| SES region | `us-east-1` |
| Verified sending identity | `playfunia.com` |
| Default configuration set | `playfunia-default` |
| Account suppression reasons | `BOUNCE`, `COMPLAINT` |
| SES production-access review | `DENIED` |
| AWS Support case | `179260258600758` |

The account belongs to the existing organization and uses its consolidated payment arrangement. The invoice unit separates charges incurred in the new account. It does not move historical charges or redirect costs from applications still sending through the original account.

The new account owner email is recorded in AWS Organizations. Administrators in the management account can access the member account through `OrganizationAccountAccessRole`.

## Verification completed

- AWS confirmed the invoice unit's receiver and linked-account rule.
- The three new Easy DKIM CNAME records were added through Hostinger and resolve publicly. All 18 pre-existing DNS record groups were preserved.
- SES reports `VerifiedForSendingStatus=true` and DKIM `SUCCESS`.
- A message to the AWS mailbox simulator was accepted using the new account and `playfunia-default` configuration set. No customer was emailed.
- Production access remains disabled. AWS accepted the production-access request and then returned review status `DENIED` with the case ID above.
- The Support API cannot read the denial correspondence on the account's current support plan (`SubscriptionRequiredException`). The owner must view the case in the AWS Support console or the email correspondence to obtain the reason.

## Production cutover remains outstanding

Playfunia's website and employee portal still send from the original account. The new invoice therefore does not yet contain their production SES usage. Toy Republic currently uses Hostinger SMTP and has no SES sending usage to migrate.

After the AWS production-access denial is resolved:

1. Confirm `ProductionAccessEnabled=true` and adequate sending quotas in `us-east-1`.
2. Import the existing SES bounce/complaint suppressions into the new account, preserving the website's local `email_suppressions` mirror and manual blocks.
3. Configure and verify bounce/complaint monitoring for the new account; existing monitoring of the original account will not automatically follow the migration.
4. Create separate, least-privilege SMTP credentials for the website and employee portal. Create SES suppression-read credentials for the website's validator. Do not grant application credentials organization or billing administration permissions.
5. Update the website's SMTP and SES API credentials together, and update the employee portal's SMTP credentials. Retain protected rollback copies outside version control.
6. Build/restart the affected services and verify sending, suppression checks, and service health. Confirm the sending credentials resolve to account `643600677615`.
7. Confirm production usage appears in the dedicated account and its `Playfunia-SES` invoice unit after AWS billing data refreshes.

## References

- [AWS invoice configuration](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/invoice-configuration.html)
- [Creating invoice units](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/invoice-configuration-create.html)
- [SES production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

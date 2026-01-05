# Kidz 4 Fun – Waiver Retention & Export Policy

This repository implements a minimum five-year retention policy for all digitally signed waivers. The following practices are in place to satisfy legal requirements and operational auditing.

## Storage Guarantees
- Each waiver record persists `signedAt`, optional `expiresAt`, and `archiveUntil` timestamps. (`archiveUntil` defaults to five years after signature.)
- Waivers are never deleted by automated processes. Any archival or purge must be explicitly initiated by an administrator following legal review.
- Guardian and child metadata are stored in MongoDB, replicated according to the deployment’s database strategy (Atlas cluster or self-hosted replica set).

## Export & Backup
- Staff can export all waivers at any time via the backend route `GET /api/waivers/export` (CSV). The export includes guardian contact details, child roster, accepted policies, opt-in status, and retention timestamps.
- Recommended backup cadence:
  1. Schedule a weekly export to an encrypted storage bucket (e.g., S3 with lifecycle rules).
  2. Maintain a quarterly off-site backup (e.g., Glacier / cold storage).
  3. Log each export in the organization’s compliance tracker (date, operator, destination).

## Disaster Recovery Checklist
1. Verify MongoDB backup snapshots or point-in-time restore windows cover at least 5 years.
2. Ensure CSV exports are accessible and can be re-imported for audits.
3. Run the export endpoint in staging after each release to confirm no regressions.

## Future Enhancements
- Automate export delivery to compliance storage using a scheduled job (e.g., cron, serverless function) with signed URLs.
- Add admin tooling to flag waivers approaching `archiveUntil` for legal review before deletion.
- Integrate integrity checks (hash of exported files stored separately) for tamper-evident archives.

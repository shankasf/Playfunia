# Phase 5 Verification Checklist

Use this list before each release to ensure compliance with the Kidz 4 Fun business rules and legal obligations introduced in Phase 5.

## 1. Waiver Retention & Export
- [ ] Confirm `archiveUntil` is set to >= 5 years out for new waivers (check Mongo sample record).
- [ ] Trigger `GET /api/waivers/export` and verify CSV contains guardian, children, accepted policies, marketing opt-in, timestamps.
- [ ] Ensure documentation (`docs/data-retention.md`) matches actual implementation and backup workflow is scheduled or planned.

## 2. Cleaning Fee Visibility
- [ ] Create a booking via UI and ensure pricing breakdown shows the $50 cleaning fee exactly once.
- [ ] Inspect API response (`POST /api/bookings`) to confirm `cleaningFee = 50` in created booking.

## 3. Deposit Enforcement
- [ ] Booking creation response contains `depositAmount` equal to 50% of `total`.
- [ ] Stripe PaymentIntent dashboard shows charge amount equal to deposit (not full total).
- [ ] Booking record updates to `paymentStatus = deposit_paid`, `balanceRemaining = total - deposit`.
- [ ] Frontend displays deposit amount, balance due, and blocks double payment attempts.

## 4. Sibling Discount Validation
- [ ] `BuyTicketPage`: 2 kids = $35, 3 kids = $50, 4 kids = $65 (trio + $15), etc.
- [ ] API payload sent to `/tickets/reserve` matches displayed bundle total.

## 5. Waiver Gating
- [ ] With no valid waiver, booking form shows waiver warning and prevents submission.
- [ ] Ticket purchase button remains disabled (or form errors) until waiver is signed.
- [ ] After signing waiver, gating disappears (no redundant warnings).

## 6. Regression Smoke Tests
- [ ] Backend `npm run build` passes.
- [ ] Frontend `npm run build` passes.
- [ ] Authenticated API smoke: login, `/users/me`, `/bookings`, `/tickets/reserve`.
- [ ] UI sanity: Home, Book Party, Buy Ticket, Membership pages render without console errors.

# Activate Ringside Door and QR tickets

Code deployment is separate from provider acceptance. The developer's Stripe sandbox is connected and owner-only; the organiser's live Stripe cutover remains pending. Never enable live sales just to preview the screens.

## Current handover

- Supabase project: `eoyougxlheclxqkbmlud`.
- Initial owner requested: `ryan786w@gmail.com`.
- Later owner: `info@sohaibboxing.com`. Invite and verify the replacement, enrol MFA and test its access before removing Ryan's owner role.
- `/door/` is a PWA installed through Safari Share → Add to Home Screen, or Chrome → Install / Add to Home screen. Installation is public; staff data requires individual login, MFA and protected event assignments.
- Tickets arrive through an email link to a QR ticket. Buyers can print / save as PDF or show it on a phone. There is no postal delivery.
- On 22 October the owner confirmed a sandbox payment, ticket email/PDF, phone installation, admission and duplicate rejection. No live payment or promotional campaign has been enabled.

## Database and staff activation

1. Hosted migrations through `202610210001_staff_management.sql` were applied on 21 October after approval. Event/staff functions and 17 private RLS tables were verified in the dashboard. Do not rerun creation migrations over existing tables. Retain SQL history and migration files for future changes.
2. Verify all private tables have RLS enabled and `anon` / `authenticated` have no direct table or schema access. Verify public customer/scanner RPC grants separately from service-only payment/email RPCs. Do not expose `ringside_private` in the Data API settings.
3. Supabase SMTP was configured using Resend and the user confirmed recovery email, authenticator and admin login success. Keep trusted `/door/` redirects and public staff signup disabled. Recovery supports the trusted code/link callback; never use a localhost redirect in production. Keep email verification enabled. Working account emails do not establish that the separate ticket email worker is connected.
4. The initial owner account already exists. The owner can invite/add scanner or editor accounts using Admin -> Door team after deployment; invitation sending requires `SUPABASE_SECRET_KEY`. Assign actual events to scanners/owners who will scan. Never infer roles from domains, signup or user metadata. Editors cannot scan. `/door/install/` provides public installation instructions; installation grants no account access.
5. Set the Netlify server variables shown in `.env.example`: project URL, publishable key and independent `DOOR_SESSION_KEY`. Set `AUTH_MODE=supabase` only when ready to test owner access. In that mode missing configuration fails closed; the legacy shared password cannot be used.
6. Activate the owner invitation on `/door/`, enrol an authenticator, verify it and choose a personal password. Then sign in again. `/door/?next=admin` opens the CMS for an owner/editor after MFA. Roles and event assignments are checked server-side on every relevant action. Do not share the owner's Supabase/Netlify account with door staff.

`DOOR_SESSION_KEY` is a random 32-byte key encoded as 64 hex characters. Keep it in server environment only. Rotating it signs out staff. `RINGSIDE_TICKET_KEY` is a different key: **do not rotate it casually**, since existing printed QR codes and download links depend on it. A planned rotation needs versioned keys and ticket reissue; key versioning is not implemented yet. No browser receives either key or the Supabase secret key.

For first-time ticket activation only, `/admin/setup-key/` lets the human operator generate a new key locally and copy it into Netlify's secret Production value. It does not retrieve existing server keys or store/transmit the generated key. Preserve the existing key when one has already been configured. A PowerShell alternative is `scripts/New-TicketSigningKey.ps1`.

## Inventory and payments

Sandbox account: Sohaib Boxing / Fight Hub `acct_1USxhh6eqbP6UUXp`, Snapshot webhook `we_1USxuG6eqbP6UUXppIyN6S0j`, API version `2026-09-30.endive`. Protected keys, Resend sender and Turnstile were configured by the user. Commit `2df9aa7` removes the obsolete Checkout payment_method_types field rejected by this API version. Sandbox payment, email/PDF and sequential phone admission/duplicate rejection were confirmed on 22 October. Test event `db7f78e0-4748-47d1-89a1-cd054f5fe4b7` has a £1 category; it must be disabled before live cutover. Catalog/checkout with a test key requires an MFA owner. Keep privileged keys scanned and preserve the ticket signing key across host moves.

Use the organiser's existing Stripe account for handover, starting with its test credentials. Configure `PUBLIC_SITE_URL` exactly. Webhook endpoint: `/api/stripe/webhook`. Subscribe to checkout completion, asynchronous payment success, checkout expiry and charge refund events. Payment methods are managed in Stripe's Dashboard; verify enabled methods before live cutover. The webhook checks signed raw bytes, timestamp, test/live mode, session ID, payment ID, currency and the reserved total. Only a confirmed paid reservation can issue admissions. Test partial/full refunds and out-of-order notifications too.

Publish reviewed real event details, explicit admission windows and confirmed category capacities through the owner CMS before launch. Event publication synchronises inventory and queues relevant event notices atomically. Changing to a different fight creates a new event ID; earlier bookings preserve purchased prices and snapshots. The current £1 test fixture was created separately from the public homepage; real inventory has not yet been published.

Configure Cloudflare Turnstile with the live hostname and `booking` action. Both client widget and server verification are required. A browser total is never accepted. Pending reservations keep capacity until Stripe confirms expiry/cancellation/refund; uncertain checkout creation needs reconciliation rather than blind timeout release. Set up alerts for stuck reservations, payment failures and manual-review refunds before launch.

## Transactional email

Resend ticket delivery is configured using the user's verified siteboss.co sender, and the first test email arrived. Replace it with a verified organiser-controlled sender for handover (for example `tickets@sohaibboxing.com`). Verify SPF/DKIM and deliverability, disable private-link click tracking, and arrange DNS/billing with the domain owner.

The `ticket-email` Netlify scheduled function processes at most five jobs per minute once `TICKET_EMAIL_ENABLED=true` and keys exist. Netlify scheduled functions cannot be invoked through a public URL. Uncertain responses retry with a stable idempotency key; jobs stop for review after eight attempts or 23 hours. Monitor failures and configure bounce/complaint handling before launch. The queue supports ticket and event notices, including cancellation and fighter withdrawal; it does not send promotional campaigns.

`TICKETING_ENABLED` and `TICKET_EMAIL_ENABLED` were enabled for the authorised owner-only sandbox test after verifying the database had zero orders and zero queued emails. The checkout also requires Stripe, email sender and Turnstile configuration. Keep the test-key owner gate until the remaining acceptance checks and organiser live cutover are complete. No live card data enters this website.

## Required tests on the hosted services

- Real invitation → verified email → MFA → password choice → sign-in → password recovery, logout and role revocation.
- Owner/editor CMS access; scanner CMS denial; no-MFA or unassigned scanner denial.
- Two **independent database connections / phones** admitting the same QR at once: exactly one succeeds. Local PGlite tests check repeat requests on a single engine; they do not replace this hosted concurrency test.
- iPhone Safari and Android Chrome installation, camera permission, QR scanning from print and another phone, loss of connectivity and resuming from the background.
- Stripe test purchase, wrong totals, duplicate webhooks, full/partial refund before and after payment, expiry, group names, exact QR decoding and invalid download link.
- Ticket email inbox/spam delivery, retry after a simulated provider timeout, an emailed private link, PDF printing and no ticket generation before payment confirmation.
- Privacy notice, organiser/controller identity, booking/refund/transfer rules, retention durations, erasure/export handling, legal holds and backup expiry. These decisions remain with the organiser. No automatic deletion schedule is enabled.

Marketing consent records are staged separately. Ticket buyers are not automatically subscribed. Double opt-in confirmation, no-login unsubscribe, suppression checks, campaign tooling and policy sign-off still need integration before promotional email is enabled.

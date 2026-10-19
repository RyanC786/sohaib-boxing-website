# Activate Ringside Door and QR tickets

Code deployment is separate from account, database, sender and payment activation. Stripe is intentionally deferred by the organiser. Never enable sales just to preview the screens.

## Current handover

- Supabase project: `eoyougxlheclxqkbmlud`.
- Initial owner requested: `ryan786w@gmail.com`.
- Later owner: `info@sohaibboxing.com`. Invite and verify the replacement, enrol MFA and test its access before removing Ryan's owner role.
- `/door/` is a PWA installed through Safari Share → Add to Home Screen, or Chrome → Install / Add to Home screen. Installation is public; staff data requires individual login, MFA and protected event assignments.
- Tickets arrive through an email link to a QR ticket. Buyers can print / save as PDF or show it on a phone. There is no postal delivery.
- No real invitation, payment, email campaign or deletion was performed in developing these changes.

## Database and staff activation

1. Confirm the 17 October foundation exists in the hosted project. Apply only missing migrations, in filename order, through an authenticated administrative connection. The three 19 October migrations are not yet applied there. Do not rerun the first migration over existing tables.
2. Verify all private tables have RLS enabled and `anon` / `authenticated` have no direct table or schema access. Verify public customer/scanner RPC grants separately from service-only payment/email RPCs. Do not expose `ringside_private` in the Data API settings.
3. Configure verified SMTP in Supabase Auth. The **Invite user** and **Reset password** email templates must contain `{{ .Token }}` and direct users to the trusted `/door/` URL to enter the code. Token codes work with the server endpoint; the app does not accept browser fragment access tokens. Keep public staff signup disabled and email verification enabled. Test actual expiry and code length against the project configuration.
4. Invite the initial owner through Supabase Auth. Assign its returned Auth UUID an `owner` row in `ringside_private.staff` through the protected administrator connection. Never infer roles from email domains, public signup or user-editable metadata. Only explicitly invited staff receive roles. Add `event_staff` rows for scanners and owners who will scan. Editors cannot scan.
5. Set the Netlify server variables shown in `.env.example`: project URL, publishable key and independent `DOOR_SESSION_KEY`. Set `AUTH_MODE=supabase` only when ready to test owner access. In that mode missing configuration fails closed; the legacy shared password cannot be used.
6. Activate the owner invitation on `/door/`, enrol an authenticator, verify it and choose a personal password. Then sign in again. `/door/?next=admin` opens the CMS for an owner/editor after MFA. Roles and event assignments are checked server-side on every relevant action. Do not share the owner's Supabase/Netlify account with door staff.

`DOOR_SESSION_KEY` is a random 32-byte key encoded as 64 hex characters. Keep it in server environment only. Rotating it signs out staff. `RINGSIDE_TICKET_KEY` is a different key: **do not rotate it casually**, since existing printed QR codes and download links depend on it. A planned rotation needs versioned keys and ticket reissue; key versioning is not implemented yet. No browser receives either key or the Supabase secret key.

## Inventory and payments (later)

Use the organiser's existing Stripe account, starting with its test credentials. Configure `PUBLIC_SITE_URL` exactly. Webhook endpoint: `/api/stripe/webhook`. Subscribe to checkout completion, checkout expiry and charge refund events. Card payments are the only enabled Checkout payment method. The webhook checks signed raw bytes, timestamp, test/live mode, session ID, payment ID, currency and the reserved total. Only a confirmed paid reservation can issue admissions. Test partial/full refunds and out-of-order notifications too.

Configure event IDs, explicit admission windows and confirmed category capacities in the private database. Categories start disabled. Reconcile them with the CMS's display names, dates and prices before launch. Changing a public event into a different fight must create a new event ID. Existing reservations preserve purchased prices and event snapshots. Automatic CMS-to-inventory synchronisation and event-change mail are not enabled yet; completing that mapping is required before live ticket sales.

Configure Cloudflare Turnstile with the live hostname and `booking` action. Both client widget and server verification are required. A browser total is never accepted. Pending reservations keep capacity until Stripe confirms expiry/cancellation/refund; uncertain checkout creation needs reconciliation rather than blind timeout release. Set up alerts for stuck reservations, payment failures and manual-review refunds before launch.

## Transactional email

Resend support is implemented but no account, domain or sender has been provisioned. Verify a sender on an organiser-controlled domain (for example `tickets@sohaibboxing.com`), SPF/DKIM and deliverability before configuring `RESEND_API_KEY` and `TICKET_FROM_EMAIL`. Disable click tracking on private ticket links. Domain DNS changes and provider billing must be handled with the domain/account owner.

The `ticket-email` Netlify scheduled function processes at most five ticket jobs per minute once `TICKET_EMAIL_ENABLED=true` and all required keys exist. Netlify scheduled functions cannot be invoked through a public URL. An uncertain provider response retries with the same idempotency key. Jobs stop for review after eight attempts or 23 hours; check the provider before requeuing an old ambiguous delivery. Monitor failures and configure provider bounce/complaint handling before launch. The queue does not send promotional campaigns or event-change templates.

Keep `TICKETING_ENABLED=false` and `TICKET_EMAIL_ENABLED=false` until an end-to-end test has passed. The checkout endpoint also requires configured Stripe, verified email sender settings and Turnstile before it can create a payment session. No live card data enters this website.

## Required tests on the hosted services

- Real invitation → verified email → MFA → password choice → sign-in → password recovery, logout and role revocation.
- Owner/editor CMS access; scanner CMS denial; no-MFA or unassigned scanner denial.
- Two **independent database connections / phones** admitting the same QR at once: exactly one succeeds. Local PGlite tests check repeat requests on a single engine; they do not replace this hosted concurrency test.
- iPhone Safari and Android Chrome installation, camera permission, QR scanning from print and another phone, loss of connectivity and resuming from the background.
- Stripe test purchase, wrong totals, duplicate webhooks, full/partial refund before and after payment, expiry, group names, exact QR decoding and invalid download link.
- Ticket email inbox/spam delivery, retry after a simulated provider timeout, an emailed private link, PDF printing and no ticket generation before payment confirmation.
- Privacy notice, organiser/controller identity, booking/refund/transfer rules, retention durations, erasure/export handling, legal holds and backup expiry. These decisions remain with the organiser. No automatic deletion schedule is enabled.

Marketing consent records are staged separately. Ticket buyers are not automatically subscribed. Double opt-in confirmation, no-login unsubscribe, suppression checks, campaign tooling and policy sign-off still need integration before promotional email is enabled.

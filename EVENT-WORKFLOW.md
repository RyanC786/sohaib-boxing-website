# Event publishing and customer updates

Implementation is prepared in this checkout. Hosted activation requires `supabase/migrations/202610200001_event_workflow.sql`, followed by an owner/editor MFA sign-in to import the existing Netlify CMS state. The import preserves the draft, publication history and published content; the original Blobs document is retained. Do not enable payments or email delivery merely by deploying this code.

## Two separate statuses

- **Event status:** scheduled, postponed, cancelled, sold out or completed. Cancellation/postponement closes booking and admission. A cancelled/completed event cannot be reopened to reactivate old tickets; create a new event.
- **Fighter participation:** confirmed or withdrawn. A withdrawal leaves the event status unchanged. For a scheduled event, booking, countdown and admission continue; valid tickets keep the same QR. The website, checkout, private ticket page and emails disclose the fight-card change.

Suggested wording for the current situation, to enter in the event's withdrawal notice:

> Sohaib Mohammed has withdrawn due to injury and will not be fighting. The boxing event is still going ahead as scheduled. If this change affects your booking, please contact the organiser with your booking reference to discuss the available options.

The reason and ticket-holder options are editable. Do not use “event cancelled” to describe a fighter withdrawal. Do not assume a withdrawal automatically resolves refund eligibility. Customer requests and any transfer require organiser follow-up.

## Publish once

An authenticated owner with MFA publishes event/inventory changes. Editors can prepare drafts and publish non-event copy. PostgreSQL checks the revision, updates the website publication, event record, category availability/prices and notification outbox in one transaction. If capacity is too low or details are incomplete, the publication rolls back. Each new event/category has a new UUID; historical orders retain their event and purchased terms/prices. Admission windows are editable relative to the published UK doors time.

Cancellation, postponement, fighter withdrawal and other material event-detail updates queue a deduplicated service email per paid order for that event. Buyers are not subscribed to marketing by this action. New purchase confirmations include the latest withdrawal notice. A late payment for a cancelled/postponed event receives that notice instead of an admission invitation. Cancelling an event does not itself claim that Stripe has refunded anyone.

The sender freezes queued message data, uses leases and provider idempotency, suppresses untouched superseded notices, and stops unsuccessful jobs for organiser review. Hard-bounce/complaint suppressions prevent delivery; a marketing unsubscribe does not suppress essential booking notices. The ticket office shows pending, sent and failed counts. Email sending requires the verified Resend sender, privileged database key, ticket signing key and `TICKET_EMAIL_ENABLED=true`; it can continue when new sales are disabled.

## Refunds and transfers

The private ticket page lets a buyer record one refund or transfer request using the existing private booking capability. Only the owner sees customer requests and updates their progress/private notes. Recording or marking a request resolved does **not** refund money, approve a transfer or issue a replacement ticket. Actual Stripe refunds must be confirmed by the verified webhook; transfers and replacement QR issuance remain a separate operation to implement before offering automatic transfers.

Policies are editable per event and displayed before checkout, on the event page and in messages. Orders snapshot the booking terms. The checkout rejects a stale event revision so the buyer must reload and review updated details. The initial wording is a starting point for the organiser's policy review, not a claim that every legal requirement has been settled.

## Verification

Run `npm test`, `npm run build`, and (with the local server running) `node scripts/event-browser-check.mjs` and `node scripts/browser-check.mjs`. Browser checks use isolated synthetic API fixtures; they do not publish an actual cancellation, contact a buyer or make a payment. Hosted owner/MFA, provider delivery, Stripe test-mode and independent-device concurrency acceptance remain required.

# Digital tickets — implemented code, awaiting activation

The repository now contains the installable staff app at `/door/`, individual staff login with MFA, server-controlled reservations, signed Stripe notifications, per-attendee QR generation, printable tickets at `/ticket/`, and a scheduled transactional email queue. These are not operational until the hosted Supabase migrations, staff accounts, inventory, Stripe test integration and verified email sender are configured. Stripe connection is deferred at the user's request. Existing public booking buttons continue to use the current official booking provider.

No live charge, customer email, owner invitation or customer-data deletion has been performed. No physical tickets are posted: the booking email opens the private QR ticket, which the buyer can print or show on their phone. The ticket email is separate from marketing consent.

## Implemented workflow and acceptance requirements

1. Collect the buyer's email and a full name for each attendee, including group orders. Show booking/transfer/refund rules. Do not collect ID document scans or numbers.
2. Reserve capacity with an expiry and create Stripe Checkout using server-side prices and event IDs. Never trust a browser-supplied total.
3. Verify Stripe's signed webhook and paid status before issuing anything. Handle retries idempotently and delayed payment success/failure if enabled. A success-page visit is not proof of payment. Unique constraints prevent duplicate orders/tickets.
4. Issue one admission record per attendee with a cryptographically random QR token. Store its hash, event, attendee, category, order and status. QR payloads contain only an opaque token or staff-scanner URL, never personal details.
5. Email a secure download link with one printable ticket per admission. Show attendee name, event/date/time/venue, category, order reference and a high-contrast QR with a quiet zone. The same ticket works printed or on a phone. Provide resend and delivery-failure recovery.
6. Signed-in event staff scan on a mobile phone, view minimal attendee details, check ID, then tap Admit. Scanning alone must not consume the ticket.
7. The server performs an atomic conditional update from valid to used in a transactional relational database. Only one concurrent admission succeeds. Later scans show already used and the admission time; wrong-event, refunded, transferred or revoked tickets fail.

A QR can be copied; one-use validation plus checking ID mitigates reuse and a copied ticket being presented first. Staff must be online, with backup connectivity and a supervised outage procedure. Offline scanners cannot reliably prevent concurrent duplicates.

Use a relational database for order records, inventory reservations and check-ins; the CMS object store is not the transaction system. Separate owner/admin and event-scanner accounts. Scanner roles must not expose CMS editing, refunds or customer exports. Use MFA where supported and log admissions/overrides.

Refunds revoke tickets. Approved transfers rotate tokens so old QRs stop working. Resending must not create another admission. Event edits preserve historical purchase prices and order snapshots; schedule/venue changes need explicit buyer notification and regenerated ticket downloads. Add name/order lookup for damaged QR codes and supervisor-only logged overrides.

Before live sales: connect the organiser's Stripe account, verified transactional-email sender, relational database and staff identity provider. Confirm capacities, seating, approved policies and privacy retention. Test payments, webhook signatures/retries, delayed payments, expiry, refunds, group orders, duplicate/concurrent scans, wrong events and ID mismatches in test mode. No live charges or new paid subscriptions are authorised by this proposal.

References: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe webhooks](https://docs.stripe.com/webhooks), [Netlify storage](https://docs.netlify.com/build/data-and-storage/overview/).


## Current limits

The Door team interface manages individual staff and event assignments; invitations require the protected server connection and verified account emails. Hosted event/staff migrations were applied on 21 October 2026. Event publication synchronises website content, inventory and event-notice outbox atomically; deployment and activation must still be verified. Set capacities and admission windows explicitly. New events use new IDs and preserve earlier orders. Refund/transfer requests are tracked, but actual transfers, supervisor overrides, resend controls and a customer account portal remain follow-up work. Partial refunds revoke all admissions on the affected order and mark it for manual review. Holds with uncertain checkout creation require Stripe reconciliation.

Email delivery uses Resend through a disabled-by-default scheduled function. It claims ticket and event-change jobs with leases, stable provider idempotency and finite retries (eight attempts or 23 hours). It never treats all buyers as marketing subscribers. Supabase SMTP separately sends account/recovery emails; owner recovery and MFA were confirmed working by the user. Ticket email API configuration and sandbox purchase-to-door acceptance remain separate activation tasks. See `STRIPE-AND-DOOR-HANDOVER.md`.

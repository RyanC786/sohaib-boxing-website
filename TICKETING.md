# Digital tickets — proposed next integration

This is a design for the next stage, not an operational ticket service.

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

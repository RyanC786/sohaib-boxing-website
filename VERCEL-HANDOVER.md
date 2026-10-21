# Hosting direction: Vercel before handover

The user confirmed on 19 October 2026: keep Netlify for the current setup, move the completed site to Vercel before handover, then connect the custom domain there. **Do not change DNS or migrate production hosting yet.** Supabase remains the identity and ticket database across the move.

The repository is not currently a complete Vercel deployment. Importing `dist` alone would omit login, the CMS, payments, QR retrieval and the email worker. Complete and test the following conversion before pointing a domain at Vercel.

## Preserve data and accounts

- Keep the existing Supabase project, Auth users, protected staff roles, event assignments, tickets, orders and consent records. Hosting migration must not create a second ticket database.
- Verify the CMS import to Supabase through the protected website adapter (event migration applied 21 October); migrate remaining Netlify Blobs image objects and the legacy import adapter. Preserve drafts, publications, revision checks, history and media links until replacements are verified.
- Export and verify content/images before changing the storage adapter. Do not delete the old store as part of the first migration.
- Keep the admission QR signing key and receipt-token key material unchanged during the host move. Existing opaque QR tokens must continue to identify the same admission. A host move is not a reason to rotate ticket tokens or make attendees print replacement tickets.

## Replace hosting-specific adapters

- Expose the existing Web Request/Response handlers through Vercel API route adapters. Preserve routes, protected cookies, origin checks, timeouts and role enforcement. Core authentication/ticket modules already live under `server/`.
- Replace Netlify Blobs calls inside content/media functions with the migrated store. Do not leave server imports that require Netlify runtime credentials.
- Replace the Netlify scheduled email function with a Vercel-compatible authenticated scheduler endpoint and a suitable schedule for the chosen plan. Keep leases, send-time order checks, stable provider idempotency and failed-job monitoring.
- Translate `dist/_headers` and relevant `netlify.toml` headers into Vercel configuration. Verify CSP, camera permissions, no-store private responses, QR-link referrer protection, the installation manifest and service-worker scope on the actual deployment.

## Connect the final domain

- Copy required server settings directly into Vercel's protected Production environment. Never put privileged keys in browser variables, Git, an exported archive or chat. Preview builds must not inherit production secrets by default.
- Update `PUBLIC_SITE_URL`, Supabase's site/allowed redirect URLs, verified email links and later Stripe webhook configuration to the final HTTPS domain. Keep Stripe disabled until the organiser's existing account is connected in test mode and verified.
- Check www/apex redirects and private ticket-link fragment preservation. Supabase users keep their passwords; browser cookies are host-specific, so staff should expect to sign in again.
- Test the final domain with a real owner login/MFA flow, two independent scanner devices, a printable QR, a test payment/refund and an email delivery before changing DNS.
- Switch DNS only after that reviewable deployment works. Preserve a rollback route, check old emailed ticket links and disable obsolete payment notifications only after the cutover is verified.

## Handover conditions

Initial app owner: `ryan786w@gmail.com`. Later transfer ownership to `info@sohaibboxing.com` after that account is verified, MFA-enrolled and tested. Staff receive individual accounts; sharing the hosting-provider owner's account is not the admission workflow.

CMS-to-event/inventory synchronisation is implemented with the event migration. Before live sales verify the deployed adapter/import, capacities/admission windows, policies, sender and sandbox acceptance in `supabase/ACTIVATION.md`. Neither the hosting move nor the domain change should silently enable payments, marketing or data deletion.

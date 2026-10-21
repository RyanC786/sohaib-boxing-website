# Ringside Studio

The Netlify-backed dashboard lives at `/admin/`. It edits events, ticket display prices, every image slot, gallery order/captions, page wording, links and page metadata. Image frames are consistently rounded and 4:3.

## Activate once

Production uses individual Supabase accounts and MFA with `AUTH_MODE=supabase`. Owner recovery, MFA and admin login were confirmed working by the user. The legacy shared-password adapter is for local/old deployments; it cannot bypass missing configuration in Supabase mode. See `supabase/ACTIVATION.md`.

The event migration and `server/website-service.mjs` import the existing `ringside-cms` Blobs document on the first protected admin read; Supabase then owns transactional content/event publication. Uploaded images remain in the `ringside-images` Blobs store. Preserve both stores during migration. Deploy the full repository; uploading only `dist` omits the backend. The old ChatGPT Sites preview is separate.

## Editing

Save draft → Preview → Publish changes. Drafts never replace public data until published. The last ten publications can be restored into a draft; restoration does not auto-publish. Conflicting saves are rejected. Download backup exports the draft JSON. Existing open visitor pages see updates on their next page load.

Event dates use UK time, including BST/GMT changes, and feed every event date label and countdown. Postponed, cancelled and sold-out statuses disable booking links. Page wording is edited alongside a saved-draft preview; identical phrases share edits across pages. Structured event, ticket and gallery fields have their own sections.

Upload JPEG, PNG or WebP images up to 4 MB. Existing artistic crops remain until a focal point is changed. Uploaded originals are retained so old publications remain restorable. The gallery's first three images appear on the homepage. Media can also use HTTPS image addresses.

## Access

Owner/editor roles are protected in Supabase and require MFA. Owners publish event/inventory changes and manage staff; editors cannot grant roles or bypass publication restrictions. The Door team screen adds/invites personal accounts, pauses non-owner staff and assigns scanners to events. Invitations require the protected server connection and verified SMTP. Installation alone grants no access. Hosted migrations through `202610210001` were applied on 21 October 2026; all 17 private tables have RLS enabled.

If live content cannot be retrieved, the site shows a warning and disables booking links; fallback prices are not represented as current.

## Local testing

Node 22+: `npm ci`, `npm test`, `npm run dev`. Open `http://127.0.0.1:4173/admin/`. The local-only test password is printed by the development server. Local data is in ignored `.cms-local/` and never deployed. `npm run build` checks syntax and content schemas; Netlify bundles server functions separately.

## Ticketing limitation

The ticketing backend, atomic event/inventory publication, printable QR receipts, event-notice outbox and protected scanner are implemented. Sandbox credentials, ticket-email settings, deployed-route checks and phone acceptance are separate activation steps. Existing external booking links remain until first-party checkout is deliberately enabled. Refund/transfer requests track progress; they do not execute refunds or replacement issuance. See `TICKETING.md`, `EVENT-WORKFLOW.md` and `STRIPE-AND-DOOR-HANDOVER.md`.

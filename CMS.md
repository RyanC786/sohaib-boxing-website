# Ringside Studio

The Netlify-backed dashboard lives at `/admin/`. It edits events, ticket display prices, every image slot, gallery order/captions, page wording, links and page metadata. Image frames are consistently rounded and 4:3.

## Activate once

In the existing Netlify project's **Project configuration → Environment variables**, add `CMS_ADMIN_PASSWORD`, using a private password of at least 20 characters, available to Functions. Redeploy and sign in at `https://sohaib-boxing.netlify.app/admin/`. Do not put this value in GitHub or chat. Production has no default password; it stays locked until configured.

Netlify automatically provides storage credentials. The CMS uses site-wide `ringside-cms` and `ringside-images` Blobs stores, which survive code deployments. Deploy the full GitHub repository, not a manual upload of only `dist`. The old ChatGPT Sites preview is a separate static deployment and does not run this backend.

## Editing

Save draft → Preview → Publish changes. Drafts never replace public data until published. The last ten publications can be restored into a draft; restoration does not auto-publish. Conflicting saves are rejected. Download backup exports the draft JSON. Existing open visitor pages see updates on their next page load.

Event dates use UK time, including BST/GMT changes, and feed every event date label and countdown. Postponed, cancelled and sold-out statuses disable booking links. Page wording is edited alongside a saved-draft preview; identical phrases share edits across pages. Structured event, ticket and gallery fields have their own sections.

Upload JPEG, PNG or WebP images up to 4 MB. Existing artistic crops remain until a focal point is changed. Uploaded originals are retained so old publications remain restorable. The gallery's first three images appear on the homepage. Media can also use HTTPS image addresses.

## Access

This release is a single-owner CMS, with signed eight-hour HttpOnly/Secure/SameSite cookies, same-origin write checks and Netlify login rate limiting. Changing the server password revokes all sessions; sign-out removes the browser cookie. There is no staff invitation, per-person audit trail, MFA or password-reset email yet. Add distinct staff roles before handling customer records or door scanning.

If live content cannot be retrieved, the site shows a warning and disables booking links; fallback prices are not represented as current.

## Local testing

Node 22+: `npm ci`, `npm test`, `npm run dev`. Open `http://127.0.0.1:4173/admin/`. The local-only test password is printed by the development server. Local data is in ignored `.cms-local/` and never deployed. `npm run build` checks syntax and content schemas; Netlify bundles server functions separately.

## Ticketing limitation

This dashboard does not yet process Stripe payments, issue QR tickets, send ticket emails or scan admissions. Prices here are display prices: the existing external booking provider must be updated separately until checkout is integrated. See `TICKETING.md`.

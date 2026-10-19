# Sohaib Mohammed — Boxing Website

A responsive black-and-gold website for professional boxer Sohaib Mohammed, with a three-photo scrolling hero, metallic gold typography, glass ticket cards, a painted fighter portrait, a filtered photo gallery and an event countdown.

## Run locally

Use Node 22 or later. From this directory, run:

```sh
npm ci
npm test
npm run dev
```

Open http://127.0.0.1:4173 or `/admin/`. See [CMS.md](CMS.md) for one-time Netlify activation and dashboard usage. The local-only test password is printed by the development server.

## Project structure

- `dist/index.html`: shared page shell.
- `dist/app.js`: page content, routing by pathname, countdown, ticket estimates, gallery and scroll effects.
- `dist/style.css`: responsive layout, gold finishes and photographic treatments.
- `dist/assets/`: original photography, event poster and generated painted portrait.
- `dist/*/index.html`: directly accessible route entry points.
- `AUDIT.md`: original-site audit and integration notes.
- `.openai/hosting.json`: existing Sites deployment identity and static output configuration; contains no authentication credentials.

## Publishing

For Netlify, deploy the full repository's `main` branch. `netlify.toml` selects `dist` and runs `npm run build`; Netlify also bundles the server functions. Uploading only `dist` does not deploy the dashboard backend.

The live CMS runs at https://sohaib-boxing.netlify.app/. The historical private preview at https://sohaib-boxing-ringside.ryanc7.chatgpt.site/ is a separate static deployment without this backend.

## Content and integrations

The event date, ticket tiers, biography and original images were taken from https://sohaibboxing.com/. The dark painted portrait is an AI-created interpretation of the supplied original portrait. Fonts are loaded from Google Fonts.

Booking, enquiry submission and ticket retrieval still link to existing official services. The calculator is an estimate and does not process payments. Shared event content now comes from the CMS, with the original 24 October 2026 event as the initial default. External checkout prices must be updated separately until Stripe is connected. See [TICKETING.md](TICKETING.md) for the digital-ticket proposal.

Original imagery and branding remain subject to their owners' rights. No public reuse licence is granted by this repository.


## Staff app and QR tickets (19 October 2026)

`/door/` is the phone-installable staff app. `/ticket/` displays private printable QR tickets; `/ticket/buy/` is gated checkout code awaiting payment, inventory, bot-protection and email activation. Individual account mode disables the legacy shared admin password. All customer data and QR tokens are excluded from service-worker caching.

Use `npm test` for the PostgreSQL, access-control, payment and QR tests. `npm run build` also copies the pinned QR decoder into the scanner shell. `node scripts/browser-check.mjs` runs optional mobile browser checks (Playwright and Chrome required). See [supabase/ACTIVATION.md](supabase/ACTIVATION.md) for configuration and remaining hosted checks. The existing Netlify deployment must receive a new Git commit before these routes appear there.

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

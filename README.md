# Sohaib Mohammed — Boxing Website

A responsive black-and-gold website for professional boxer Sohaib Mohammed, with a three-photo scrolling hero, metallic gold typography, glass ticket cards, a painted fighter portrait, a filtered photo gallery and an event countdown.

## Run locally

No dependency installation or build step is required. From this directory, run:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173 in your browser. Use an HTTP server rather than opening the HTML files directly, since assets use root-relative paths.

## Project structure

- `dist/index.html`: shared page shell.
- `dist/app.js`: page content, routing by pathname, countdown, ticket estimates, gallery and scroll effects.
- `dist/style.css`: responsive layout, gold finishes and photographic treatments.
- `dist/assets/`: original photography, event poster and generated painted portrait.
- `dist/*/index.html`: directly accessible route entry points.
- `AUDIT.md`: original-site audit and integration notes.
- `.openai/hosting.json`: existing Sites deployment identity and static output configuration; contains no authentication credentials.

## Publishing

Serve `dist` as the public directory on a static host with directory-index support. The current private preview is https://sohaib-boxing-ringside.ryanc7.chatgpt.site/. The Sites publishing workflow manages its own source destination independently of GitHub.

## Content and integrations

The event date, ticket tiers, biography and original images were taken from https://sohaibboxing.com/. The dark painted portrait is an AI-created interpretation of the supplied original portrait. Fonts are loaded from Google Fonts.

Booking, enquiry submission and ticket retrieval link to the existing official services. The ticket calculator is a local estimate and does not transfer selections or process payments. Event information is a static snapshot and should be checked with the team before a production launch. The countdown targets 24 October 2026 at 19:00 UK time.

Original imagery and branding remain subject to their owners' rights. No public reuse licence is granted by this repository.

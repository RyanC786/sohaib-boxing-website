# Security check - 22 October 2026

Scope: the existing Netlify boxing application and its repository. This is a targeted code/dependency/configuration review with automated tests, not a penetration test, incident investigation or guarantee against compromise.

## Verified

- The application is buildless HTML/CSS/JavaScript plus Node.js Netlify functions and Supabase. `npm ls next react react-dom react-server-dom-webpack react-server-dom-turbopack react-server-dom-parcel --all` found none of those packages. The Next.js App Router, Server Actions, image optimisation and React Server Components attack surfaces are not part of this application.
- An online `npm audit --json` succeeded: zero known vulnerabilities across the lockfile (92 dependency entries reported). An initial sandbox network failure was not treated as a clean result; the check was repeated with registry access.
- `npm test`: all 38 tests passed. `npm run build`: schema, JavaScript syntax and public loaders passed.
- No standard Stripe secret-key, webhook-secret or Supabase secret-key patterns were found in the public `dist` JavaScript/HTML/JSON/CSS/map files. This limited pattern check is not a full historical secret scan.
- Staff identity is checked server-side; active role, authenticator assurance and event assignment are enforced by protected operations/database functions. Shared-password fallback is disabled in individual-account mode.
- Cookies are encrypted, HttpOnly, Secure and SameSite=Strict. Remembered sessions retain their fixed 12-hour limit. State-changing staff/booking requests check origin and content type.
- Stripe fulfilment checks the signature, timestamp, mode, currency, reservation identity and server-owned prices. Tests cover repeat notifications, restricted access and revoked/refunded admission.
- Image upload requires authenticated editor/owner access, limits size and accepts JPEG/PNG/WebP signatures; uploaded files are stored as blobs, not executed as server programs. No shell execution/eval path was found in the reviewed runtime functions.

## Hardening change

Added a Content-Security-Policy to `/admin/` and `/admin/*` in both Netlify configuration sources. Scripts and connections are limited to the same origin; objects and framing are blocked; base URI changes and foreign form destinations are blocked. Existing inline style attributes remain permitted for the current image/copy editor; inline JavaScript is not permitted. External HTTPS images remain allowed because the editor supports external image addresses.

The scanner and ticket routes already have restricted policies; payment booking permits the required Cloudflare Turnstile origin. Browser verification of the published admin dashboard and read-only anonymous endpoint checks follow deployment.

## Remaining production safeguards

- Final domain/HTTPS, trusted auth redirects and branded sender configuration; real merchant sandbox/live cutover and final acceptance are still required.
- Confirm MFA and recovery arrangements on the hosting, GitHub, Supabase, Stripe, email and DNS administrator accounts. Application MFA is not proof that these provider accounts have MFA enabled.
- Agree backups and restore testing, operational alerts, dependency-update responsibility, retention/deletion and incident response. These were not activated or independently verified by this check.
- Complete the outstanding venue, offline, paused-staff and simultaneous-device checks. Test hosted declined/expired payments before public launch.
- Keep provider secrets out of source/browser code; preserve the stable ticket-signing key. No key rotation or provider permission changes were performed in this review.

Reference: https://nextjs.org/blog/nextjs-security-update-october-14-2026 and https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components (checked 22 October 2026).

Deployment verification: Netlify published commit aece0d2 (deploy 6ada59ee0c69eec3bde3b2bc). Public read-only HTTP checks confirmed the admin CSP, HSTS, nosniff and no-store headers. Anonymous GET requests to /api/admin/content, /api/admin/staff and /api/door/events all returned 401. This documentation follow-up is retained for the next substantive push rather than triggering another production release.

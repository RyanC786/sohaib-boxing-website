# Hosted sandbox acceptance — 22 October 2026

Scope: Sohaib Boxing / Fight Hub Stripe sandbox; Netlify website; Supabase project eoyougxlheclxqkbmlud; authorised test recipient ryan786w@gmail.com. Live organiser Stripe cutover remains pending.

## Confirmed

- Owner password recovery, individual sign-in and authenticator; admin access.
- Phone installation of Ringside Door and MFA login.
- Checkout server-priced sandbox booking, signed fulfillment, ticket email and PDF viewing.
- One payment for two attendees produced separate tickets; one was admitted independently.
- A second scan of an admitted ticket was rejected (user's physical-phone result).
- £2 sandbox refund reached the database; both admissions revoked; prior admission timestamp retained.
- Refunded private email link shows an explicit refund notice, without admission QR codes.
- Downloaded 1000 × 1700 ticket PNG decoded correctly; downloading and refreshing did not invalidate the ticket.
- Latest backup test: order 28121d81-b11f-4899-8086-6324f68e96ce, ticket 70bcb027-2db6-498c-947e-35a3b08f2e1a, Stripe payment pi_3UTJ3I6eqbP6UUXp1ZtRhGtQ. Saved while unused, then fully refunded in sandbox. Website confirmed refund; physical scanner rejected the saved QR: “The ticket is not valid for this event. Ask your supervisor to check the booking.”

No private receipt capabilities, admission tokens or provider secret values are recorded here.

Notification delivery check: two frozen simulated payloads were queued for the authorised developer recipient via `scripts/test-notification-delivery.sql`. The scheduled worker marked both `fighter-withdrawn-v1` and `event-cancelled-v1` sent after one attempt; Resend subsequently showed both as Delivered. Inbox receipt and wording confirmation are pending. The fixture does not change the public event or demonstrate hosted CMS publication.

## Remaining

Staff test account: invitation sent to fizacaan@gmail.com after explicit access approval; scanner role assigned only to the test event. On 22 October the user confirmed the replacement arrived in the main inbox, was accepted and allowed Fiza to log in. A refreshed owner dashboard independently showed scanner · Active · Email verified, with only the test event assigned. The user subsequently confirmed the scanner was redirected away from /admin/ to scanning, and saw only its assigned 28 October event. They reported a fresh Fiza ticket scan and repeat scan; exact repeat-result wording was not supplied. Suspension acceptance remains pending. The recipient reported the original invitation in spam with no usable link. Supabase source contained a valid ConfirmationURL anchor; root cause of the recipient rendering is unconfirmed. The first preview of the replacement template did not persist; an initial replacement email still used the old subject. On 22 October the template was reapplied from `supabase/templates/invite-user.html` (button, visible URL and OTP fallback), explicitly saved with a success toast, and verified to persist after reloading. One further invitation was sent with subject “Your Sohaib Boxing staff invitation”; Resend confirmed Delivered (message 01a16389-675d-7df2-aa3a-5b0edbb215a4). SPF/DKIM are verified for temporary siteboss.co; the recipient confirmed this replacement rendered correctly and arrived in the main inbox. Do not claim template improvement guarantees inbox delivery. Replace temporary sender/domain and template URL at final handover.

- Confirm inbox receipt/wording for both simulated notices; actual hosted CMS publication acceptance remains separate.
- Hosted paused-staff and simultaneous-device checks remain; separate scanner event isolation and dashboard denial were user-confirmed.
- Declined and expired hosted checkout; multi-device simultaneous admission and offline recovery. App-switch session retention was user-confirmed.
- Partial refunds currently revoke the booking's admissions and mark it for organiser review. Per-attendee partial-refund resolution is not implemented.
- Final real event/category/capacity publication, booking policies and organiser identity/retention decisions.
- Final Netlify domain/sender/redirect/Turnstile/webhook setup and organiser's live Stripe cutover. The user chose to remain on Netlify Personal; Vercel migration is no longer a launch requirement.
- Refresh printable PDF handover and reusable skills after final acceptance; existing PDF predates these results.

## Remembered staff device update

Added an explicit opt-in at password sign-in. Checked devices retain the encrypted HttpOnly cookie across browser/app restarts for the remainder of a fixed 12-hour session; unchecked sign-ins use a browser-session cookie. MFA is still required for a new login. Token renewal and MFA verification preserve the preference and original expiry, including admin and sandbox-checkout responses. Returning from the background rechecks authentication/access and restores the desk; stale admission results are discarded, and the user reopens the camera. Sign-out clears the cookie; staff/MFA/event checks remain server-side. Automated suite: 38 passed; build passed. The user subsequently confirmed that leaving the phone app and returning kept the login. An actual phone-call interruption was not separately recorded.

Deployment of b168a6c was skipped by Netlify: account deployment credits exceeded. The live site remains on 2cf64fa; the remembered-login feature is committed and tested but is not live. Resume deployment when credits are restored, or complete the separately planned Vercel migration before phone acceptance.

After the user upgraded the existing team to Personal, a manual deployment of 9320fc5 succeeded on 22 October 2026 (Netlify deploy 6ada1cd648f94242d1f00ec3). Dashboard confirmed Published, 11 functions deployed, 20 seconds total. The remembered-login update is now live. The user subsequently confirmed the checkbox login retained the phone session after switching apps. This documentation-only follow-up is retained locally for the next substantive push to avoid consuming another production deployment.

## Client presentation

Created a 12-page PDF presentation dated 22 October 2026 covering public-site comparison, dashboard, Stripe/QR flow, installed scanner, event notices, security, test evidence, launch dependencies and indicative pricing. Original public-site QR/payment claims are acknowledged; its private backend was not audited. Indicative £8,000-£15,000 replacement-build estimate is explicitly an independent scope-based estimate, not a supplier quote. Revised proposed friend price is £2,800 for the build, plus an optional £250/month managed-care service. Software/provider charges are excluded from these rates and their price table was removed from the presentation. Public supplier/provider sources are linked in the PDF. Domain ownership, live merchant cutover, real inventory/policies, backups/retention and venue acceptance remain unresolved dependencies.

Presentation revision: added proposed managed admin/event updates, weekly booking-path checks, monthly sandbox/email/QR checks, routine maintenance, basic technical SEO and monthly reporting. Proposed combined hands-on allowance is four hours/month with business-hours support, extra work agreed separately. Indicative commercial care estimate £500-£750/month is labelled an estimate and supported by current supplier examples, not claimed as a market average. Replaced injury references in the client PDF with unforeseen circumstances. Year-one arithmetic: £2,800 + (12 x £250) = £5,800; subsequent full-year care £3,000, excluding software and any applicable VAT. This is a proposal, not an activated monitoring service or an accepted service contract.

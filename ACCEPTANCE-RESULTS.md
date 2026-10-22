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

Staff test account: invitation sent to fizacaan@gmail.com after explicit access approval; scanner role assigned only to the test event. On 22 October the user confirmed the replacement arrived in the main inbox, was accepted and allowed Fiza to log in. A refreshed owner dashboard independently showed scanner · Active · Email verified, with only the test event assigned. Separate-role admission, MFA enforcement, editor denial and suspension acceptance remain pending. The recipient reported the original invitation in spam with no usable link. Supabase source contained a valid ConfirmationURL anchor; root cause of the recipient rendering is unconfirmed. The first preview of the replacement template did not persist; an initial replacement email still used the old subject. On 22 October the template was reapplied from `supabase/templates/invite-user.html` (button, visible URL and OTP fallback), explicitly saved with a success toast, and verified to persist after reloading. One further invitation was sent with subject “Your Sohaib Boxing staff invitation”; Resend confirmed Delivered (message 01a16389-675d-7df2-aa3a-5b0edbb215a4). SPF/DKIM are verified for temporary siteboss.co; the recipient confirmed this replacement rendered correctly and arrived in the main inbox. Do not claim template improvement guarantees inbox delivery. Replace temporary sender/domain and template URL at final handover.

- Confirm inbox receipt/wording for both simulated notices; actual hosted CMS publication acceptance remains separate.
- Separate scanner admission, MFA enforcement, event isolation, account suspension and editor denial on hosted services.
- Declined and expired checkout; multi-device simultaneous admission and offline/background recovery.
- Partial refunds currently revoke the booking's admissions and mark it for organiser review. Per-attendee partial-refund resolution is not implemented.
- Final real event/category/capacity publication, booking policies and organiser identity/retention decisions.
- Vercel adaptation and final domain/sender/redirect/Turnstile/webhook setup; organiser's live Stripe cutover.
- Refresh printable PDF handover and reusable skills after final acceptance; existing PDF predates these results.

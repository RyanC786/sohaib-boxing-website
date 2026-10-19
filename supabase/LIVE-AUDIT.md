# Hosted database verification — 19 October 2026

Project: `eoyougxlheclxqkbmlud` (`sohaib-boxing`). Observed through its authenticated Supabase dashboard.

The existing 11-table foundation was confirmed first. The three 19 October migration files were then submitted as a single transaction. Supabase returned **Success. No rows returned**. No customer fixtures, test payments or event records were inserted. After the user created their own Auth account and password, the administrative owner setup assigned that verified account the active owner role.

The subsequent read-only PostgreSQL catalogue audit returned:

| Check | Observed result |
| --- | --- |
| Private tables | 13 |
| Private tables without row-level security | 0 |
| Private tables granting browser roles SELECT/INSERT/UPDATE/DELETE | 0 |
| Public Ringside RPCs executable by `anon` | 0 |
| Service-only Ringside RPCs executable by `authenticated` | 0 |
| Initial owner Auth user (`ryan786w@gmail.com`) | Created by the user |
| Verified Auth users matching that owner email | 1 |
| Initial owner staff role | owner, active |
| Orders | 0 |

Customer/scanner RPCs are intentionally excluded from the service-only grant check: `ringside_access`, `ringside_scan`, `ringside_door_events`, `ringside_my_orders`, `ringside_marketing_preference`. They require a valid user JWT and perform their own staff/event/ownership checks. A public publishable key does not grant privileged access.

The hosted email settings show **Set up custom SMTP to edit templates**. An SMTP sender has not been configured. The initial owner role is verified. The Netlify login variables are saved for Production only; deployment is being refreshed to load them. Initial owner MFA enrolment is still pending. Neither this audit nor deployment activates Stripe, creates a charge, sends a customer email or enables automatic deletion.

These catalogue checks confirm deployed permissions. They do not replace hosted JWT/MFA testing, two-device admission concurrency, physical phone camera tests, real email delivery or Stripe test-mode checkout. Those acceptance checks remain required in [ACTIVATION.md](ACTIVATION.md).

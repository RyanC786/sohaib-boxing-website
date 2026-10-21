"""Generate the printable operational checklist; no credentials are read."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT

root=Path(__file__).resolve().parents[1]
pages=[
('01 / Start here', 'Boxing tickets & door app', [
('Purpose', 'Connect your separate Stripe sandbox first. Test the complete purchase, email, printed QR and admission journey. Repeat the checks in the organiser\'s Stripe account before enabling real payments.'),
('Current destinations', 'Website: https://sohaib-boxing.netlify.app/\nOwner login: /door/?next=admin\nStaff app: /door/\nPhone instructions: /door/install/\nSupabase project: eoyougxlheclxqkbmlud\nTemporary email domain: siteboss.co'),
('Activation status - 21 October 2026', 'The owner has confirmed password recovery, authenticator and admin login work. Event and staff updates are prepared on codex/event-workflow; hosted migration and deployment must be verified separately. Sandbox payments, ticket emails, invitations and physical-phone acceptance remain activation steps. Do not treat passing local tests as proof of live delivery.'),
('Workflow', 'Publish one event and its inventory -> reserve server-priced tickets -> pay in Stripe Checkout -> signed webhook confirms payment -> issue one opaque QR per attendee -> email private printable ticket link -> assigned staff scan -> compare name with ID -> tap Admit -> any subsequent admission is rejected.'),
('Before starting', '[ ] Confirm the sandbox account name and account ID.\n[ ] Confirm test mode; do not use another business account.\n[ ] Use a dedicated test event and authorised test recipients.\n[ ] Keep real sales disabled until every acceptance check passes.\n[ ] Record results and provider IDs, never secret values.'),
]),
('02 / Stripe sandbox', 'Keys & webhook setup', [
('1. Create the test connection', 'Open your new Stripe sandbox and verify the account name. In Developers / API keys, obtain its test secret key. Enter it directly into the hosting provider\'s protected environment as STRIPE_SECRET_KEY. Never paste keys into chat, Git, browser code or this printout. This implementation uses hosted Checkout; it does not need a frontend publishable key.'),
('2. Register the webhook', 'In Workbench -> Webhooks -> Create event destination, choose Your account and Snapshot events. Choose Webhook endpoint and enter:\nhttps://sohaib-boxing.netlify.app/api/stripe/webhook\nThe handler expects the complete event.data.object payload; thin events are not supported.'),
('3. Select these four event types', 'checkout.session.completed\ncheckout.session.async_payment_succeeded\ncheckout.session.expired\ncharge.refunded'),
('4. Connect its signing secret', 'Open the new destination\'s signing secret and enter it directly into STRIPE_WEBHOOK_SECRET on the same hosting deployment. The API key and webhook secret must belong to the same account and mode. A CLI forwarding secret is not the deployed endpoint\'s signing secret.'),
('5. Deploy and verify', 'Redeploy after protected settings change. A webhook before activation can return 503; do not ignore this. Inspect Stripe delivery results after a genuine sandbox Checkout purchase. Confirm a successful 2xx response, one paid order, one ticket per attendee and one queued confirmation. A manually fabricated dashboard event may lack the reserved order metadata.'),
('Test payment', 'Use card 4242 4242 4242 4242, a future expiry and any valid three-digit CVC in sandbox only. Do not enter a real card. Also test declined and abandoned payments: neither may produce a valid admission.'),
]),
('03 / Protected configuration', 'Database & email', [
('Staff login settings', 'SUPABASE_URL = the existing project URL\nSUPABASE_PUBLISHABLE_KEY = public project key\nAUTH_MODE = supabase\nPUBLIC_SITE_URL = https://sohaib-boxing.netlify.app\nDOOR_SESSION_KEY = independent random 32-byte key, stored as 64 hex characters\nKeep the current working Supabase SMTP and trusted /door/ recovery redirects.'),
('Ticket service settings', 'SUPABASE_SECRET_KEY = privileged server key, never browser-side\nRINGSIDE_TICKET_KEY = a separate persistent random 32-byte key as 64 hex characters\nSTRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET = sandbox values\nTICKETING_ENABLED = false until the controlled test is ready\nPreserve the ticket key across deployments and the later host move. Casual rotation breaks existing QR codes and receipt links; versioned rotation is not yet implemented.'),
('Transactional ticket emails', 'RESEND_API_KEY = protected sending key for the verified domain\nTICKET_FROM_EMAIL = Sohaib Boxing - Test <tickets@siteboss.co>\nTICKET_EMAIL_ENABLED = false until sending to test recipients is approved\nSupabase SMTP sends account emails. The ticket worker separately uses the Resend API for QR confirmations and event notices. Working password resets do not prove that ticket delivery is connected.'),
('Booking protection', 'Configure the Turnstile site and secret keys from .env.example for the actual hostname. Verify the booking action server-side. Confirm the deployed scheduled email worker runs, retries have stable idempotency keys, failed jobs are visible, and bounces/complaints are suppressed.'),
('Database activation', 'Apply pending migrations in order after checking hosted state. Verify private-table RLS, no direct anon/authenticated table access, owner/editor MFA and scanner event checks. Import the existing CMS content through the protected adapter; confirm the public event matches its ticket inventory. Publish alone must not silently enable selling.'),
]),
('04 / Door team', 'Install, assign & admit', [
('1. Give each person an account', 'Owner opens Admin -> Door team. Invite a scanner using their own email, or add an existing account. Invitations require the protected Supabase server connection and working account emails. Never share the owner password or hosting account. Website editors have no scanning permission.'),
('2. Assign the actual event', 'Check the event beside the active scanner. An installed app or a successful login alone grants no admission access. Pause an account to block its next protected request. Only the owner may manage staff; the staff screen cannot remove or demote the owner.'),
('3. Install on their phone', 'Open https://sohaib-boxing.netlify.app/door/\niPhone: open in Safari -> Share -> Add to Home Screen.\nAndroid: open in Chrome -> Install app / Add to Home screen.\nThe public installation QR on the Door team screen links to this page; it is not an admission ticket. A store download is not required. Browser menus may vary.'),
('4. First sign-in', 'Accept the invitation, choose a personal password, enrol an authenticator and verify a fresh code. Sign in on the installed app, select the assigned event and allow the camera when requested. Test the rear camera on an actual phone before event day.'),
('5. Admission procedure', 'Scan the printed QR or phone screen. Read the returned attendee name, event and ticket category. Compare with the attendee\'s ID. Only then tap Admit. Lookup does not consume the ticket; Admit performs the single-use database operation. A screenshot can be copied, so QR alone is not proof of identity; online single-use admission plus the ID check provides the control.'),
('Venue preparation', '[ ] Two independent phones tested against the same ticket.\n[ ] First admission succeeds; second is already used.\n[ ] Wrong event, revoked/refunded ticket and unassigned staff fail.\n[ ] Venue Wi-Fi/mobile backup and chargers available.\n[ ] Offline mode never admits; escalate to the organiser.'),
]),
('05 / Event operations', 'Changes & customer notices', [
('New event', 'Create another event so it receives a new event ID and fresh ticket categories. Set date, timezone, doors, venue, promoter, images, capacity, prices, admission window and customer policy. Review draft, then publish. Do not overwrite an old event to recycle its sold tickets. Past orders retain their event and purchased price.'),
('Fighter withdrawal: event continues', 'Use fighter status Withdrawn with a clear notice such as: Sohaib Mohammed has withdrawn due to injury and will not be fighting. The event is still going ahead. Review the message and policy before publishing. This is distinct from event cancellation: valid admission and sales can continue where configured.'),
('Actual cancellation or postponement', 'Choose the correct event status, reason and customer message. Review the visible stamp, booking closure and email preview before publishing. The transaction queues a notice for that event\'s paid bookings; the worker sends only when configured and enabled. Monitor pending/sent/failed status. Do not test a cancellation on the real advertised event.'),
('Email content follows the event', 'Ticket confirmations and change notices use event-specific title, date, venue, promoter, attendee details, booking reference and policy/contact text. Paid bookings receive essential service messages. Marketing is separate and requires recorded consent. Editing an event is not permission to send a marketing campaign.'),
('Refunds and transfers', 'Customers can record a refund or transfer request from their private receipt page; the owner tracks its progress. A recorded/resolved request is not proof that money moved or a replacement ticket was issued. Actual refunds are performed in Stripe; confirm webhook processing revokes admission. Partial refunds need organiser review. Transfers and replacement issuance need a separate controlled procedure.'),
('Before public sales', 'Approve the refund/withdrawal policy, privacy notice, retention schedule and support contact. Keep ID checks visual; do not collect ID images without a separate approved need. Test cancellation notices with authorised test addresses and confirm no duplicate emails on webhook retries.'),
]),
('06 / Acceptance & handover', 'Switch to their account safely', [
('Record the sandbox results', '[ ] Successful Checkout -> signed 2xx webhook -> correct paid order.\n[ ] QR email arrives; private receipt prints a readable QR.\n[ ] Duplicate webhook creates no extra tickets or emails.\n[ ] Declined/abandoned payment creates no valid admission.\n[ ] Staff MFA, event restriction, ID review and one-use Admit pass.\n[ ] Cancelled event closes sales/admission; fighter withdrawal does not.\n[ ] Refund invalidates admission; email failures can be investigated.\nTest date: ______________  Reviewer: ____________________'),
('Organiser Stripe cutover', 'Obtain access to their account with their permission. Repeat the sandbox setup in their account first. Recreate the webhook there and use that account\'s own keys/secrets. For live launch, switch API key and live endpoint secret together, redeploy and verify. Never copy your sandbox webhook secret into their account. Do not delete their previous website\'s webhook until outstanding payments/refunds and ownership of each order are reconciled.'),
('Vercel migration before domain handover', 'Vercel import of dist alone is insufficient. Convert API handlers, media storage, scheduled email worker, rate limits and security headers. Keep the same Supabase project, event IDs and ticket signing key. Migrate the CMS adapter/state and uploaded media with verification. Review VERCEL-HANDOVER.md before changing DNS. This conversion is not yet complete.'),
('Final domain and owner', 'Update PUBLIC_SITE_URL, Supabase site/redirect URLs, Turnstile hostnames and Stripe webhook endpoint. Verify the organiser\'s sending domain with Resend, then switch sender and Supabase SMTP configuration. Keep old emailed links usable through redirects and preserve URL fragments. Invite and test the replacement owner with MFA before removing temporary owner access. Staff will sign in again after the hostname changes.'),
('Stop / rollback conditions', 'Keep sales disabled if inventory, signed webhooks, email delivery or admission checks fail. Preserve provider records and outstanding orders; do not delete the database to reset testing. Reverting code does not undo a database migration or payment. Reconcile in-flight transactions before reverting credentials or disabling old endpoints.'),
('Official references', 'docs.stripe.com/webhooks\ndocs.stripe.com/testing\ndocs.stripe.com/keys\nSource project: github.com/RyanC786/sohaib-boxing-website\nReusable skills: github.com/RyanC786/Skills.md'),
])]

styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='KickerBox',fontName='Helvetica-Bold',fontSize=10,textColor=colors.HexColor('#8b6a22'),spaceAfter=10))
styles.add(ParagraphStyle(name='TitleBox',fontName='Helvetica-Bold',fontSize=27,leading=31,textColor=colors.HexColor('#161914'),spaceAfter=20))
styles.add(ParagraphStyle(name='SubBox',fontName='Helvetica-Bold',fontSize=11,leading=15,spaceBefore=10,spaceAfter=5))
styles.add(ParagraphStyle(name='BodyBox',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=8))
out=root/'output/pdf/boxing-ticketing-stripe-and-door-handover.pdf';out.parent.mkdir(parents=True,exist_ok=True)
story=[];md=['# Boxing tickets, Stripe and door app handover\n','Prepared 21 October 2026. Reverify activation status before use.\n']
for index,(kicker,title,sections) in enumerate(pages):
    if index:story.append(PageBreak())
    story.extend([Paragraph(escape(kicker.upper()),styles['KickerBox']),Paragraph(escape(title),styles['TitleBox'])])
    md.append(f'## {kicker}: {title}\n')
    for heading,body in sections:
        story.append(KeepTogether([Paragraph(escape(heading),styles['SubBox']),Paragraph(escape(body).replace('\n','<br/>'),styles['BodyBox'])]))
        md.extend([f'### {heading}\n',body+'\n'])
def footer(c,doc):
    c.setStrokeColor(colors.HexColor('#c8aa61'));c.line(46,40,549,40)
    c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#666666'));c.drawString(46,27,'SOHAIB BOXING  /  OPERATIONS CHECKLIST  /  21 OCT 2026');c.drawRightString(549,27,str(doc.page))
SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=46,leftMargin=46,topMargin=43,bottomMargin=54).build(story,onFirstPage=footer,onLaterPages=footer)
(root/'STRIPE-AND-DOOR-HANDOVER.md').write_text('\n'.join(md),encoding='utf-8')
print(out)

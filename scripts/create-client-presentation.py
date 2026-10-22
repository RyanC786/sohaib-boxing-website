"""Client-facing, evidence-bounded presentation. No keys, customer records or live QR tokens."""
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.utils import ImageReader
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/sohaib-boxing-client-presentation.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,file in [('Body','arial.ttf'),('Bold','arialbd.ttf'),('Display','ARIALNB.TTF')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
W,H=595.276,841.89
M=44; CW=W-2*M
INK=HexColor('#141813'); GOLD=HexColor('#b08b3e'); PALE=HexColor('#f4f1e9'); MUTED=HexColor('#5c655c'); LINE=HexColor('#dedfd7'); GREEN=HexColor('#286245')
c=canvas.Canvas(str(OUT),pagesize=(W,H))
c.setTitle('Sohaib Boxing | Website, Ticketing & Door App')
c.setAuthor('Prepared for Sohaib Boxing by Ryan')
c.setSubject('Project presentation, capability review, indicative value and launch plan - 22 October 2026')
page=0

def text(x,y,value,size=11,font='Body',color=INK):
    c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,value)

def para(value,x,y,width=CW,size=10.5,color=INK,leading=None,font='Body'):
    style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.43,textColor=color,spaceAfter=0)
    p=Paragraph(value,style);_,height=p.wrap(width,H)
    if y-height<43: raise ValueError(f'Page {page} content overflows: {value[:70]} -> {y-height}')
    p.drawOn(c,x,y-height)
    return y-height

def rule(y):
    c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(M,y,W-M,y)

def start(kicker,title,sub=''):
    global page
    page+=1
    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(INK);c.rect(0,H-54,W,54,fill=1,stroke=0)
    text(M,H-33,'SM  /  SOHAIB BOXING',12,'Bold',white)
    text(W-192,H-32,'PROJECT PRESENTATION',8,'Body',HexColor('#d9c68d'))
    text(M,H-88,kicker.upper(),9,'Bold',GOLD)
    y=para(title,M,H-107,CW,29,INK,32,'Display')-14
    if sub:y=para(sub,M,y,CW,10.5,MUTED)-20
    c.setStrokeColor(LINE);c.line(M,37,W-M,37)
    text(M,22,'Prepared for Sohaib Boxing  |  22 October 2026',8,color=MUTED)
    text(W-M-22,22,f'{page:02}',8,'Bold',GOLD)
    return y

def finish():c.showPage()

def image(path,x,y,width,height=None):
    im=Image.open(path); iw,ih=im.size
    if height is None:height=width*ih/iw
    scale=min(width/iw,height/ih)
    dw,dh=iw*scale,ih*scale
    c.drawImage(ImageReader(im),x+(width-dw)/2,y-dh,width=dw,height=dh,mask='auto')
    return y-height

def block(title,body,x,y,width=CW):
    y=para(title,x,y,width,13,INK,font='Bold')-6
    return para(body,x,y,width,10.3,MUTED)-18

def callout(title,body,y,fill=PALE):
    style=ParagraphStyle('box',fontName='Body',fontSize=10.2,leading=14.4,textColor=INK)
    p=Paragraph(body,style);_,ph=p.wrap(CW-28,H)
    height=ph+49
    c.setFillColor(fill);c.roundRect(M,y-height,CW,height,8,fill=1,stroke=0)
    text(M+14,y-23,title,11,'Bold',GOLD)
    p.drawOn(c,M+14,y-height+13)
    return y-height-20

def rows(items,y,widths=(150,357),headers=None):
    if headers:
        c.setFillColor(INK);c.rect(M,y-28,CW,28,fill=1,stroke=0)
        text(M+10,y-18,headers[0],9,'Bold',white);text(M+widths[0]+10,y-18,headers[1],9,'Bold',white);y-=28
    for i,(a,b) in enumerate(items):
        sa=ParagraphStyle('a',fontName='Bold',fontSize=10,leading=14,textColor=INK)
        sb=ParagraphStyle('b',fontName='Body',fontSize=10,leading=14,textColor=MUTED)
        pa,pb=Paragraph(a,sa),Paragraph(b,sb)
        _,ha=pa.wrap(widths[0]-20,H);_,hb=pb.wrap(widths[1]-20,H)
        rh=max(ha,hb)+20
        if y-rh<48:raise ValueError(f'Table overflow page {page}')
        if i%2==0:c.setFillColor(PALE);c.rect(M,y-rh,CW,rh,fill=1,stroke=0)
        pa.drawOn(c,M+10,y-ha-10);pb.drawOn(c,M+widths[0]+10,y-hb-10);y-=rh
    return y-18

def link(label,url,x,y,size=9):
    text(x,y,label,size,'Body',GOLD);c.linkURL(url,(x,y-3,x+pdfmetrics.stringWidth(label,'Body',size),y+size+2),relative=0)

def step(n,title,body,y):
    c.setFillColor(GOLD);c.circle(M+13,y-13,13,fill=1,stroke=0)
    text(M+9,y-17,str(n),11,'Bold',white)
    y=para(title,M+40,y,CW-40,12,INK,font='Bold')-5
    return para(body,M+40,y,CW-40,10.3,MUTED)-18

# 01 / Cover
page+=1
c.setFillColor(INK);c.rect(0,0,W,H,fill=1,stroke=0)
image(ROOT/'dist/assets/hero-painted-portrait.png',0,H,W)
text(M,H-56,'SM  /  SOHAIB BOXING',14,'Bold',white)
text(M,337,'WEBSITE. TICKETS. FIGHT NIGHT.',10,'Bold',HexColor('#e0c67e'))
para('Built for every round.',M,306,CW,43,white,46,'Display')
para('A premium website, editable administration dashboard and secure digital admission workflow.',M,235,440,16,HexColor('#dddcd2'),23)
text(M,131,'CLIENT PRESENTATION  /  22 OCTOBER 2026',9,'Bold',HexColor('#e0c67e'))
para('Prepared by Ryan<br/>Core workflow demonstrated in Stripe sandbox. Final business launch configuration remains.',M,110,CW,10,HexColor('#dddcd2'),15)
finish()

# 02 / Honest comparison
y=start('01 / The transformation','A stronger experience.<br/>A practical operating system.','The existing boxing identity is retained, with a more consistent visual language and a connected management workflow.')
gap=14; ww=(CW-gap)/2
text(M,y,'ORIGINAL PUBLIC WEBSITE',8,'Bold',GOLD);text(M+ww+gap,y,'REBUILT WEBSITE',8,'Bold',GOLD)
y-=12
image(ROOT/'output/verification/presentation-original-home.png',M,y,ww)
bottom=image(ROOT/'output/verification/presentation-rebuilt-home.png',M+ww+gap,y,ww);y=bottom-22
y=rows([
('Visual identity','Photographic hero and angular panels evolve into three painted scrolling hero scenes, metallic gold styling and layered cards.'),
('Content presentation','Consistent typography, clearer calls to action, rounded gallery frames and a cohesive fighter profile.'),
('Team control','A dedicated dashboard manages event details, prices, imagery, publishing and the authorised door team.'),
('Operational proof','The rebuilt payment-to-ticket-to-scan journey has been exercised in a separate sandbox, including refunds and duplicate rejection.')],y,headers=('AREA','WHAT THE REBUILD DELIVERS'))
para('Comparison boundary: the original public site already advertises QR tickets and secure checkout. Its private dashboard, payment setup and security were not audited. No claim is made that those features were absent.',M,y,CW,9,MUTED)
finish()

# 03 / Website
y=start('02 / Public website','A boxing brand with depth.','A responsive front end built around the fighter, the next event and a clear route to tickets.')
image(ROOT/'output/verification/presentation-rebuilt-home.png',M,y,CW,270);y-=291
y=rows([
('Hero & artwork','Three scrolling painted hero images; matching dark portrait artwork; gold typography, buttons and layered card styling.'),
('Event information','Event title, date, UK time, venue, promoter, imagery and countdowns use shared editable content.'),
('Ticket experiences','Boxing Only, Dinner Guest, Inner Row and VIP Ringside cards. Names, prices, descriptions and availability are editable.'),
('Supporting pages','Fighter biography, event detail, gallery/lightbox, partnerships, sponsorship, appearances, contact and ticket guidance.'),
('Gallery & layout','Consistent rounded image frames, image selection and ordering, mobile layouts and keyboard-friendly navigation.')],y)
para('The screenshots show demonstration event content. Confirm the final card, fighter participation, dates and prices before publishing the real event.',M,y,CW,9,MUTED)
finish()

# 04 / Administration
y=start('03 / Ringside Studio','The team can keep it current.','Update the event once, preview the change and publish the connected website and inventory together.')
image(ROOT/'output/verification/presentation-admin-overview.png',M,y,CW,255);y-=276
y=rows([
('Next event','Create an event with a separate identity; edit dates, doors, venue, promoter, contact, admission window and event/fighter status.'),
('Prices & inventory','Edit category pricing, capacities and online availability. Previously purchased prices remain attached to their orders.'),
('Words & images','Manage page wording, hero/event images, image library and the gallery without editing source code.'),
('Publishing','Draft, preview and publish; revision checks protect against conflicting edits. Restore from the last ten published versions.'),
('Ticket & staff office','Review booking/notification status and customer requests. Invite individual scanners, assign events and pause access.')],y)
para('Permission split: the owner manages staff and publishes event/inventory changes. Editors have restricted website duties. Scanners do not receive website editing access.',M,y,CW,9,MUTED)
finish()

# 05 / Purchase journey
y=start('04 / Payments & digital tickets','From booking to a unique QR.','One payment may cover multiple named attendees; each attendee receives a separate admission ticket.')
for n,title,body in [
 (1,'Choose the event and ticket category','Select a ticket type and quantity. Enter the booking email and a full name for every attendee; review the displayed event terms.'),
 (2,'Reserve the correct price and capacity','The server checks current inventory and reserves the booking. Browser changes cannot set their own ticket price.'),
 (3,'Pay in Stripe Checkout','Payment is handled on Stripe. A verified payment notification, rather than a customer returning to the website, confirms fulfilment.'),
 (4,'Issue one QR per attendee','Each ticket has an opaque, unique admission reference linked to its event, named attendee and category. Repeated payment notifications do not issue extra tickets.'),
 (5,'Deliver and keep a copy','The email links to a reusable private ticket page. Customers can show the QR on a phone, download a ticket image, or print/save a PDF.'),
 (6,'Validate at the door','Assigned staff scan the QR, compare the returned name with ID and confirm admission. A later attempt is shown as already used.')]:
    y=step(n,title,body,y)
y=callout('Four categories, one connected workflow','The category and amount come from the published inventory. A two-person booking creates two independent tickets. Current displayed examples are £65 / £100 / £150 / £250; these are editable, and real inventory must be approved before sales.',y)
para('Payment status: sandbox purchases and refunds have been tested. The organiser\'s live Stripe account is not connected for public sales yet.',M,y,CW,10,GREEN,font='Bold')
finish()

# 06 / Scanner
y=start('05 / Ringside Door','An app on the phone.<br/>Controlled entry at the venue.','An installable web app (PWA), opened from the staff link and added to the phone\'s home screen. No App Store listing is required.')
left=M; right=M+257
y0=y
y=block('Individual access','The owner invites each scanner by email and assigns only the events they should work. Each person uses their own password and authenticator.',left,y,235)
y=block('Fast return after a call','Tick Keep me logged in on this device at login. The protected session lasts up to 12 hours. Switching apps does not require a fresh authenticator check while it remains valid.',left,y,235)
y=block('Scan, check, admit','Camera scan or manual code lookup returns the attendee name, ticket category and status. Staff compare ID before pressing Admit. Lookup alone does not consume entry.',left,y,235)
y=block('Safe operational limits','The camera stops in the background. On return, access is rechecked and old results are cleared; tap Open ticket camera. Online access is required for admission.',left,y,235)
boxy=y0-5
c.setFillColor(INK);c.roundRect(right,boxy-360,250,360,18,fill=1,stroke=0)
text(right+20,boxy-30,'RINGSIDE DOOR',12,'Bold',HexColor('#e0c67e'))
para('Ready for fight night.',right+20,boxy-53,210,27,white,30,'Display')
para('ILLUSTRATIVE STAFF SCREEN',right+20,boxy-128,210,8,HexColor('#b8bead'))
c.setStrokeColor(GOLD);c.roundRect(right+18,boxy-285,214,120,10,fill=0,stroke=1)
text(right+32,boxy-190,'CHECK ID BEFORE ENTRY',9,'Bold',HexColor('#e0c67e'))
text(right+32,boxy-220,'Alex Example',21,'Bold',white)
text(right+32,boxy-242,'VIP Ringside',11,'Body',HexColor('#d9ddce'))
text(right+32,boxy-266,'Confirm ID, then admit',10,'Body',white)
para('Already used / invalid / refunded tickets must not be admitted.',right+20,boxy-307,210,10,HexColor('#d9ddce'))
y=min(y,boxy-380)
y=callout('Tested on a physical phone','Installation, authenticator login, ticket admission and repeat scanning were exercised. The separate scanner account was restricted to its assigned 28 October test event and redirected away from administration. Staying logged in after switching apps was confirmed by the user.',y)
link('Open the phone installation guide','https://sohaib-boxing.netlify.app/door/install/',M,y)
finish()

# 07 / Changes
y=start('06 / Event operations','Keep customers informed.<br/>Handle exceptions clearly.','Event cancellation and a fighter withdrawal are different situations, with different customer messages and admission behaviour.')
y=rows([
('New fight night','Create a new event and new inventory. Historical orders stay with their original event rather than silently moving to the next show.'),
('Fighter withdrawal','Explain unavailability due to unforeseen circumstances while keeping the show scheduled where appropriate. Website, checkout and event emails disclose the change; valid tickets can remain usable.'),
('Cancellation / postponement','For unforeseen circumstances, publish the approved cancellation/postponement reason and prominent status notice, close sales/admission, and queue event-specific service emails for paid bookings.'),
('Confirmation content','Emails include the relevant event, date, venue, booking/attendee details, welcome text, arrival guidance and policy/contact wording.'),
('Refunds','Process the refund in Stripe. Its verified notification revokes the booking\'s admissions. Saved or printed copies are then rejected by the scanner.'),
('Customer requests','Buyers can submit a refund or transfer request from the private receipt page; the owner tracks progress and private notes.')],y,headers=('SITUATION','BUILT WORKFLOW'))
y=callout('Important scope boundaries','Cancelling an event does not automatically move money. Marking a request resolved does not refund or transfer a ticket. Partial refunds currently revoke the booking\'s admissions for organiser review; automatic per-attendee refund allocation, transfers and replacement issuance are not implemented.',y)
para('Service email templates and the delivery worker have been tested with authorised recipients and isolated notices. A full real-event change rehearsal remains a pre-launch acceptance task. The organiser must approve the final policy and wording.',M,y,CW,10,MUTED)
finish()

# 08 / Security and evidence
y=start('07 / Security & verification','Controlled access.<br/>Evidence behind the workflow.','Security controls are implemented in the application and database; they are not a claim of independent certification or an external penetration test.')
y=rows([
('Staff identity','Invited accounts, individual passwords, authenticator checks, server-enforced roles and per-event scanner assignments.'),
('Protected sessions','Encrypted HttpOnly, Secure, SameSite cookies. Optional remembered device, fixed 12-hour lifetime and explicit sign-out. No password or authenticator secret stored by the app in browser storage.'),
('Private records','Supabase row-level security and protected database operations. Booking, ticket and staff information is not exposed as a public table feed.'),
('Admission controls','Random-looking QR references, event matching, admission windows, ID confirmation, single-use admission and refund invalidation.'),
('Payment & email','Server-priced reservations, signed Stripe webhooks, retry/idempotency controls, email job tracking and booking protection with Cloudflare Turnstile.')],y)
text(M,y,'VERIFICATION COMPLETED',10,'Bold',GOLD);y-=18
y=para('<b>38 automated tests passed; build validation passed.</b> Coverage includes private-table access, role restrictions, payment/QR handling, event changes, refund status and session renewal. Phone tests confirmed valid admission, duplicate rejection, saved-QR rejection after refund and staying signed in after switching apps.',M,y,CW,10.5)-18
y=callout('Customer data and marketing','Capture booking email and attendee names for ticketing. Staff perform a visual ID check; this workflow does not collect ID photographs. Marketing consent is separate from service emails. A promotional mailing system and automated retention/deletion schedule are not yet delivered.',y)
para('Remaining acceptance includes two phones admitting the same ticket, paused staff access, declined/expired hosted checkout and venue connectivity. A copied QR is not impossible: online single-use entry plus staff ID checks provide the control.',M,y,CW,9.5,MUTED)
finish()

# 09 / Value
y=start('08 / Indicative project value','A complete connected build.<br/>A friend\'s project price.','Indicative UK replacement-build estimate as at 22 October 2026. This is an independent scope-based estimate, not a supplier quote or a verified previous selling price.')
y=rows([
('Website & visual design','£2,000 - £3,500  |  Responsive pages, artwork integration, scrolling hero, gallery and ticket presentation.'),
('Admin dashboard','£1,500 - £3,000  |  Content, media, event/inventory controls and draft/preview/publishing workflow.'),
('Payments & tickets','£2,000 - £3,500  |  Stripe integration, reservations, fulfilment, unique QR tickets, emails and refund handling.'),
('Door scanner PWA','£1,500 - £3,000  |  Phone installation, camera/manual scan, staff/event access and admission control.'),
('Security, QA & handover','£1,000 - £2,000  |  Identity/MFA integration, private database controls, tests, deployment and operating guidance.')],y,headers=('WORKSTREAM','ILLUSTRATIVE ALLOCATION'))
text(M,y,'INDICATIVE COMBINED BUILD VALUE',10,'Bold',GOLD);y-=36
text(M,y,'£8,000 - £15,000',30,'Display',INK);y-=28
y=para('These workstreams overlap; the allocation is explanatory and is not a set of additional charges. Actual quotes vary with scope, support, agency overheads and acceptance requirements.',M,y,CW,9.5,MUTED)-18
c.setFillColor(INK);c.roundRect(M,y-94,CW,94,10,fill=1,stroke=0)
text(M+18,y-27,'PROPOSED FRIEND\'S PRICE',10,'Bold',HexColor('#e0c67e'))
text(M+18,y-70,'£2,800',36,'Display',white)
para('One-off website and system build.<br/>Managed care: £250 per month.',M+235,y-30,245,11,white,17)
y-=112
para('The £2,800 proposal covers the demonstrated build, agreed final launch configuration and handover. Optional ongoing management is £250/month (see next page). Software subscriptions, domain, transaction fees and additional projects are separate and discussed directly. Confirm any applicable VAT treatment in the written quote.',M,y,CW,9.5,MUTED)
finish()

# 10 / Managed care
y=start('09 / Managed website & ticketing care','You focus on the boxing.<br/>We look after the system.','Monthly care for the website, event administration, bookings and technical SEO.')
c.setFillColor(INK);c.roundRect(M,y-78,CW,78,10,fill=1,stroke=0)
text(M+18,y-26,'PROPOSED FRIEND\'S MONTHLY RATE',9.5,'Bold',HexColor('#e0c67e'))
text(M+18,y-62,'£250 / month',29,'Display',white)
para('£3,000 per year<br/>In addition to the £2,800 build.',M+287,y-23,200,10.5,white,16)
y-=96
y=rows([
('Admin & event updates','Publish approved event dates, prices, availability, imagery and wording supplied by the organiser. Keep connected event information consistent.'),
('Booking health','Weekly booking-path spot checks; monthly sandbox checkout, email and QR checks. Review payment/webhook and email failures and investigate reported booking faults.'),
('Maintenance & fixes','Routine dependency/security updates, small fixes and performance housekeeping. Review configured availability/error alerts and backup status.'),
('Practical SEO','Monthly broken-link, crawl/indexing and metadata checks; small on-page improvements to existing content. Review Search Console when connected; no ranking guarantee.'),
('Owner communication','A short monthly activity report, priorities and support through the agreed business contact. The organiser approves material event, policy and customer-notice changes.')],y,headers=('AREA','PROPOSED MONTHLY COVERAGE'))
y=callout('A clear monthly allowance','Proposed allowance: <b>up to four hours per month across the listed tasks</b>. Booking faults take priority; extra work is agreed first. Business-hours support aims to acknowledge within one working day; resolution depends on the issue.',y)
para('Monitoring and backup review are configured at onboarding. Major features, redesigns, campaigns, extensive SEO, refund decisions and dedicated fight-night cover are separate. Software/provider charges are not included. Confirm the start date, billing, time allowance and cancellation terms in the service agreement.',M,y,CW,9.3,MUTED)
finish()

# 11 / Launch
y=start('10 / Final launch checklist','The next move is domain access.<br/>Then complete the business cutover.','The core system is demonstrated; public sales should wait for these launch dependencies and acceptance checks. There is no need to move hosting to Vercel.')
for n,title,body in [
 (1,'Confirm the domain and business owner','The existing sohaibboxing.com domain already serves the old site. Obtain authorised DNS/registrar access or agree a different domain; do not buy a duplicate unnecessarily. Confirm site content/image rights and the business support contact.'),
 (2,'Connect the domain and branded email','Set up Netlify custom-domain HTTPS; preserve existing mail records. Verify the sender in Resend and update SMTP/templates, public URLs, auth redirects, Turnstile hostnames and webhook URLs. Reconcile existing issued tickets before replacing the old site.'),
 (3,'Connect their Stripe account','Repeat the test setup in the organiser\'s account, then connect the correct live key and live webhook signing secret. Keep existing payment integrations until outstanding orders/refunds are reconciled. The account owner completes any live transaction.'),
 (4,'Approve the real event and its inventory','Confirm dates, venue, promoter and fighter participation, with approved wording for any change due to unforeseen circumstances. Approve all four categories, capacities, prices, admission windows and booking buttons. Disable test inventory before public sales.'),
 (5,'Approve policies and operations','Agree refund/withdrawal terms, privacy wording, retention periods, promotional consent, backups and the proposed monthly management responsibilities. Transfers and partial refunds need the stated manual process. Add an organiser-owned administrator account.'),
 (6,'Rehearse, sign off and launch','Test declined/expired checkout, duplicate webhook handling, cancellation/fighter notices, paused staff and simultaneous scans on two phones. Check venue internet, backup connection, chargers and escalation. Run the agreed live purchase/refund check before advertising sales.')]:
    y=step(n,title,body,y)
para('Hand over the repository, account ownership, launch checklist and staff guide. Keep secret values in provider dashboards; preserve the ticket-signing key so existing QR codes remain verifiable.',M,y,CW,9.5,MUTED)
finish()

# 12 / Sources and walkthrough
y=start('11 / Pricing evidence & meeting guide','Show the journey.<br/>Agree the final launch.', 'Suggested demonstration: website -> edit a draft -> preview -> sandbox checkout -> ticket download -> assigned staff scan -> duplicate/refund rejection.')
y=block('Build-value context','Published examples: AFB lists integration-heavy builds from £8,000; NRCM lists ecommerce from £7,500 + VAT; Black & White lists custom business websites from £12,000. Packages differ. The £8,000-£15,000 build value is our scope-based estimate, not a like-for-like quote.',M,y)
y=block('Ongoing-care context','WebAsk lists revenue-generating website/app care from £500/month, excluding VAT. Forwardify lists broader website improvement/SEO plans at £550 and £750/month, excluding VAT. Webgro lists a £250/month WordPress care tier with development charged separately. Our indicative commercial allowance for this scoped combination is <b>£500-£750/month</b>, not a market average; the proposed friend rate is <b>£250/month</b> with a defined time allowance. This is basic technical SEO and system care, not a full SEO campaign.',M,y)
refs=[
 ('[1] AFB Digital Solutions - website build pricing','https://afbdigitalsolutions.co.uk/services/web-design/'),
 ('[2] NRCM Digital - website and ecommerce pricing','https://wearenrcm.com/pricing'),
 ('[3] Black & White Web Designs - website packages','https://www.bwwebdesigns.co.uk/websitepackages'),
 ('[4] WebAsk - website and app maintenance plans','https://webask.co.uk/services/maintenance-support'),
 ('[5] Forwardify - website management and SEO packages','https://www.forwardify.com/pricing/'),
 ('[6] Webgro - care plans and development allowances','https://webgro.co.uk/care-plans')]
for label,url in refs:
    link(label,url,M,y,9.2);y-=25
y-=2
y=callout('Evidence and status','Sources: public supplier pages checked on 22 October 2026; original and rebuilt public pages captured the same day; repository implementation and acceptance record; user-confirmed physical-phone tests. The original private backend was not inspected. The new system is sandbox-tested, not certified as legally compliant or independently security-audited.',y)
link('Website demonstration','https://sohaib-boxing.netlify.app/',M,y,10)
link('Staff installation guide','https://sohaib-boxing.netlify.app/door/install/',M+245,y,10)
y-=29
para('Meeting decisions: domain access, final event details and unforeseen-circumstance notices, live Stripe, account ownership and policies. Proposed investment: £2,800 build + £250/month management = £5,800 in year one if care runs for 12 months; £3,000/year thereafter. Provider charges and any applicable VAT are separate.',M,y,CW,10.2,MUTED)
finish()
c.save()
print(f'Created {OUT} ({page} pages)')

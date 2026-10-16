# Playbook: Phone Routing and Instant-Offer Form

Two ways in: call or form. Both must land in the same `leads` table with attribution attached.

## 1. Keep (647) 204-4200. Don't change it.

Matt's concern is right: changing the public number would hurt. The number is the "P" in NAP. It appears on GBP, the site, schema, citations, review replies, truck signage, and in whatever AI assistants have already learned. A new number splits that identity, and mismatched phone numbers are one of the clearest negative signals for Maps ranking and for AI assistants deciding which facts to trust.

We get all the "cool stuff" (load balancing, text-back, recording, tracking) without changing the number by **porting 647-204-4200 into Twilio**. Porting moves the same number to a new carrier. Customers dial exactly what they dial today.

### Option A (recommended): port the main number to Twilio

What we get:

- **Simultaneous ring**: rings Marce and Ryan's cells at once, first to answer takes it. Or round robin / sequential if they prefer.
- **Business hours routing**: 7am to 9pm rings phones; after hours goes to a short voicemail plus instant text-back.
- **Missed-call text-back** within 60 seconds (W03): "Hi, it's Scrappy Car. Sorry we missed you. What's the year, make and model? We'll text you a cash offer. Or get one instantly: scrappycar.ca/offer"
- **Whisper**: owner hears "Scrappy Car call from Google Ads" before connecting, so they know the brand (useful since CarCash shares the team) and the source.
- **Recording + transcript + Claude summary** into `calls` (W02). Short notice at the start: "Calls may be recorded."
- **SMS on the same number**: customers can text the number on the truck. Owners send `DONE ...` commands to it (W04).
- **Caller ID**: owners see a consistent caller ID so they recognize business calls.
- **Failover**: if Twilio or n8n is down, TwiML falls back to plain forwarding to one cell. Calls never depend on n8n being up.

Porting steps and risks:

1. Confirm who the number is with today (Rogers, Bell, Telus, a VoIP provider) and whether it's a mobile or landline number. Get the account number, PIN, and a recent bill.
2. Open a Twilio port-in request. Canadian ports usually take 1 to 3 weeks. There is a cutover window where calls can drop for minutes; schedule it for a Sunday evening.
3. Build and test the full call flow on a temporary Twilio number first. Cut over only when it's proven.
4. Confirm SMS is enabled on the ported number (Canadian long codes support it, but verify after the port).
5. If the number is currently someone's personal cell, porting removes it from that phone. Calls will still ring that cell via forwarding, but outbound calls from the cell will show the personal number unless they call out through Twilio.

### Option B (no port): conditional forwarding

Keep the carrier. Set busy / no-answer forwarding (carrier star codes) to a Twilio number. We get missed-call text-back and voicemail logging, but no simultaneous ring, no recording of answered calls, and no whisper. A decent week-1 stopgap while the port runs.

### Option C: CallRail

Same idea with a nicer UI and built-in dynamic number insertion (about 45 to 60 USD per month). Choose this if nobody wants to own Twilio config. Also supports porting.

## 2. Tracking numbers without hurting trust

Tracking numbers are additional numbers that forward to the same routing. Rules that protect NAP:

- 647-204-4200 stays the number in schema, the site's default HTML, GBP primary, every citation, the truck, and business cards.
- **Dynamic number insertion (DNI)** swaps the visible number only for visitors from a paid or tracked source (gclid present, `utm_source=tiktok`, etc.). Crawlers and organic visitors always see the main number, so Google and AI crawlers only ever learn one number.
- GBP: keep the main number as primary. Google Ads call assets use Google's own forwarding numbers, which is fine.
- One number per channel, not per keyword: `google_ads`, `social`, `print` (flyers), and one per top partner if useful. Registered in `tracking_numbers`.
- Each tracking number costs about 1.50 CAD per month on Twilio.

DNI implementation (small script on the site):

```
on page load:
  read gclid / utm_source from URL, else from first-party storage (set on landing)
  map to channel → tracking number (hard-coded map, no API call, fast)
  replace text and href of every a[href^="tel:"] and .phone-number element
  store {session_id, channel, gclid, landing_ts} in localStorage
  posthog.register({ channel, tracking_number })
```

W02 matches an incoming call to a DNI session by tracking number plus the time window, which is how a Google Ads click becomes a call with a gclid for offline conversion upload.

## 3. Instant-offer form: port from carca.sh

carca.sh already has a working, hardened flow. Reuse it; don't rebuild.

What exists in `mattwyd/carca-sh`:

- `index.html` 3-step form: vehicle (year stepper, make, model from NHTSA vPIC, km slider) → condition (runs?, rust, keys and ownership, photos) → contact (town, email, mobile, notes). Honeypot field.
- `api/vehicles.js`: make list plus models by year from NHTSA vPIC (free, no key), classifies car vs truck.
- `api/quote.js`: server-side price ladder (`priceFor`), validation, per-IP throttle, inserts into Supabase `carcash_leads`.
- `api/accept.js`: idempotent accept (guards against replay), Beeper notification.
- `api/photo.js`: Vercel Blob upload with JPEG/PNG magic-byte check, 3 MB limit.
- PostHog events: `form_step`, `quote_generated`, `offer_accepted`.

Port plan for scrappycar.ca:

1. Extract the shared API into one module used by both sites, parameterized by `BRAND` env var (`scrappycar` or `carcash`). Two options:
   - Copy `api/` into scrappy-car with `BRAND=scrappycar` (fastest, some duplication), or
   - Move shared code into a small private npm package or git submodule (cleaner once both sites evolve).
   Start with the copy; refactor when a third brand appears.
2. Change the insert target from `carcash_leads` to the unified `leads` table with `brand`, `source='form'`, and attribution fields (UTMs, gclid, posthog id, landing page). Migrate existing `carcash_leads` rows once, then keep a compatibility view named `carcash_leads` until carca.sh is switched over.
3. Read prices from `scrap_prices` instead of the hard-coded ladder, so owners can change offers without a deploy. Keep the hard-coded ladder as fallback if Supabase is unreachable.
4. Scrappy-specific copy and areas (Scarborough, Durham, east GTA) and phone number. Place the form as `/offer` plus a compact entry on the homepage hero ("Get an instant offer" next to "Call now"). A/B test placement with a PostHog feature flag.
5. Add explicit CASL consent checkbox (unticked) for SMS follow-up. Store in `consents`.
6. On accept: keep the Beeper notification, and also POST to the n8n webhook (`/webhook/lead-accepted`) so the SMS confirmation, scorecard, and attribution flow run. n8n failure must not block the customer's confirmation.
7. Speed to lead: on submit (not only accept), n8n texts the customer within 60 seconds and pings the owners. A form lead that waits an hour is a lost lead.

Offer copy note: carca.sh shows a "guaranteed cash offer". Only use "guaranteed" if the team will honour it at pickup when the car matches the description. Otherwise use "instant cash offer, confirmed at pickup". A broken guarantee becomes a bad review, which then shows up in AI answers.

## 4. Events

See `tracking-plan.md`. Form events keep carca.sh names for cross-brand funnels: `form_step`, `quote_generated`, `offer_accepted`, plus `form_started`, `form_error`, `phone_click`, `sms_click`.

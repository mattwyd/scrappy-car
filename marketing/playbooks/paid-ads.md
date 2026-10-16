# Playbook: Google Ads

Existing account: `AW-18023473103`. Current site fires `generate_lead` on tel: clicks only.

## 1. Structure

Campaigns split by geography so bids follow tow distance and margin:

- `Search - Core` (Scarborough, Port Union, West Rouge, Rouge Hill, Highland Creek, East Toronto): highest bids
- `Search - Durham` (Pickering, Ajax, Whitby, Oshawa)
- `Search - GTA` (Markham, North York, rest): lowest bids, bid down for long tows
- `Call-only` equivalents inside each, or call assets on every ad

Ad groups by intent: scrap car removal, cash for junk cars, sell car for scrap, junk car pickup same day, car removal no ownership.

Schedule: 7am to 9pm. Outside hours only if W03 missed-call text-back is live and working.

Negatives (shared list): parts, used parts, pick and pull, u pull, junkyard jobs, scrap metal prices, copper, free, diy, how to, salary, auction, insurance.

## 2. Conversion tracking

Conversions, in order of truth:

1. `pickup_completed` (offline import, value = gross margin) **primary for bidding**
2. `phone_call_60s` (Google forwarding number or Twilio, calls over 60 seconds) secondary
3. `quote_form_submit` secondary
4. `tel_click` observation only (a tap is not a call)

## 3. Offline conversion loop (W05)

1. Landing: site script stores `gclid`, `gbraid`, `wbraid`, UTMs in first-party storage (see `tracking-plan.md`).
2. Calls: dynamic number insertion shows the Ads tracking number to paid visitors. Twilio call webhook plus the DNI session lookup attaches the `gclid` to the `calls` row. For calls from Google's own call assets, use Google Ads call conversion reporting instead (no gclid available).
3. Quote form: `gclid` sent as a hidden field.
4. Pickup completed (W04) links back to the originating call or lead.
5. W05 runs nightly: selects completed pickups with a click id not yet uploaded, sends via Google Ads API `UploadClickConversions` with `conversion_value = gross_margin`, marks `uploaded_at`.
6. Enhanced conversions for leads: hashed phone number sent with the upload to improve match rate where gclid is missing.

After 30+ offline conversions per month, switch bidding to Maximize Conversion Value with the offline conversion as primary.

## 4. Creative loop

Monthly: pull search terms report into Supabase, Claude writes 15 headline and 4 description variants from top-converting terms using `prompts/ads-rsa.md`, human picks, upload. Pin "Free Towing" and the phone number.

## 5. Budget guardrail

W10 scorecard alerts if cost per pickup from Ads rises above one third of average margin for 2 consecutive weeks.

# Tracking Plan

Tools: PostHog (product analytics, funnels, replay, flags), GA4 + Google Ads tag (bidding), Supabase (source of truth for money).
Rule: PostHog and GA4 measure behaviour on the site. Supabase measures outcomes (calls, pickups, margin). Reports that involve money always come from Supabase.

## 1. PostHog setup

- One PostHog organization, one project per brand (`scrappycar`, `carcash`) or one project with a `brand` super property. **Decision: one project, `brand` super property**, so cross-brand funnels and the free-tier quota are shared. carca.sh already uses project key `phc_yRms...` on `us.i.posthog.com`; reuse it.
- Init options:
  - `person_profiles: 'identified_only'` (cheaper, fewer anonymous profiles)
  - `persistence: 'localStorage+cookie'` after consent; `memory` before consent if a banner is added
  - `session_recording: { maskAllInputs: true }` (phone and email never recorded)
  - `capture_pageview: 'history_change'`
- Super properties registered on load: `brand`, `channel`, `tracking_number`, `utm_*`, `gclid_present` (boolean, never the gclid itself).
- `posthog.identify(lead_id)` after a form submit, with person properties `{brand, city, first_channel}`. No name, email, or phone in PostHog.

## 2. Events

Naming: `object_action`, snake_case. Keep carca.sh names where they already exist.

Page and navigation

- `$pageview` (auto)
- `area_page_viewed` props: `area`
- `faq_opened` props: `question`

Contact intent

- `phone_click` props: `location` (nav, hero, sticky, footer, area_page), `number_channel`
- `sms_click` props: `location`
- `directions_click`

Instant-offer form (existing on carca.sh)

- `form_started` props: `placement` (hero, offer_page, area_page)
- `form_step` props: `step` (1 vehicle, 2 condition, 3 contact)
- `form_error` props: `step`, `field`, `error`
- `photo_uploaded` props: `count`
- `quote_generated` props: `offer`, `body_type`, `is_running`, `year`, `make`
- `offer_accepted` props: `offer`, `id`
- `offer_abandoned` (quote shown, not accepted within 10 minutes; client-side timer or server-side from Supabase)

Content

- `video_played` props: `media_id`, `platform_origin`
- `review_widget_viewed`

Server-side events (sent from n8n with the PostHog capture API, `distinct_id = lead_id` when known)

- `call_received` props: `answered`, `duration_sec`, `channel`
- `missed_call_texted`
- `pickup_completed` props: `gross_margin_band` (not exact), `channel`
- `review_received` props: `rating`

## 3. Funnels and dashboards (PostHog)

1. **Form funnel**: `form_started` → `form_step 2` → `form_step 3` → `quote_generated` → `offer_accepted`. Breakdown by `brand`, `channel`, device.
2. **Contact funnel**: `$pageview` → (`phone_click` OR `form_started`) by landing page.
3. **Area pages**: pageviews and contact rate per `area`.
4. **Replays**: filter to sessions with `form_error` or `quote_generated` without `offer_accepted`. Watch 10 per week.
5. **Experiments** (feature flags): hero form vs call-only, offer copy "guaranteed" vs "confirmed at pickup", sticky call bar variants.

## 4. Attribution capture (site script)

On first landing in a session:

```
params = gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content
if any present → store { ...params, landing_page, referrer, ts } in localStorage 'sc_attr' (first touch kept 90 days, last touch overwritten)
channel =
  gclid|gbraid|wbraid                     → google_ads
  utm_source=google & utm_campaign=gbp    → gbp
  utm_medium=social                       → social (utm_source = platform)
  utm_medium=partner                      → partner
  referrer matches chatgpt.com|chat.openai.com|perplexity.ai|gemini.google.com|copilot.microsoft.com|claude.ai → ai_assistant
  referrer is a search engine             → organic
  else                                    → direct
```

The form posts `sc_attr` and `posthog.get_distinct_id()` as hidden fields. The DNI script uses `channel` to pick the phone number.

Note `ai_assistant`: ChatGPT and Perplexity usually send a referrer (ChatGPT often adds `utm_source=chatgpt.com`). This is the only direct measure of AI-search traffic, so it gets its own channel.

## 5. GA4 and Google Ads

- Keep existing `gtag` config.
- Replace `generate_lead` on tel: click with `phone_click` (observation only in Ads, not a bidding conversion).
- Add `quote_generated` and `offer_accepted` GA4 events, import `offer_accepted` into Ads as secondary.
- Primary Ads conversion is the offline `pickup_completed` upload (see `playbooks/paid-ads.md`).

## 6. Data retention and privacy

- Session replays: inputs masked, 30 days (PostHog default on free).
- Supabase `calls.recording_url`: deleted after 90 days by W12.
- PII lives only in Supabase, never in PostHog or GA4.

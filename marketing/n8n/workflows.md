# n8n Workflows

Conventions:

- Naming: `W{nn} {Brand-agnostic name}`. Every workflow handles both brands via the `brand` field.
- Webhooks: `https://hooks.scrappycar.ca/webhook/{slug}` via Cloudflare Tunnel. Each webhook checks a shared secret header `X-Hook-Secret` (except Twilio, which is verified by Twilio signature).
- Credentials live in n8n's credential store only. Names match `infra/.env.example`.
- Every workflow has an Error Trigger linked to `W00 Error Alert`, which posts the failed node and execution URL to the Beeper ops room.
- Human approvals go to the existing Beeper room (Matrix API, same one carca.sh `accept.js` already posts to). Approver replies `Y {id}`, `N {id}`, or `E {id} new text`. `W99 Approval Router` handles replies.
- Drivers upload media through a Telegram bot (free, works on any phone, no Beeper account needed).
- After building or editing a workflow in the UI, export it to `n8n/workflows/W{nn}.json` and commit. Strip credential ids before committing (n8n exports reference ids, not secrets, but keep it clean).
- Prompts are loaded from `prompts/*.md` at build time (pasted into the node) and versioned here.

Priority for build order is the number in brackets.

---

## Lead and call loop

### W01 Form lead intake [P1]

- Trigger: Webhook `POST /webhook/lead` from the site's `api/quote.js` and `api/accept.js` (after the Supabase insert, fire and forget).
- Steps:
  1. Validate secret, normalize phone to E.164.
  2. Upsert into `leads` (id from the site) if the site did not already write the full row.
  3. If consent to SMS: Twilio SMS to customer within 60s: offer confirmation + "Reply with a good pickup time or call (647) 204-4200".
  4. Beeper message to owners: vehicle, offer, town, phone, photos, channel.
  5. PostHog capture server-side `lead_received`.
  6. If not accepted after 30 minutes and phone present: create a call-back task in Beeper ("Call back: 2012 Civic, Ajax, offered $300").
- Output: `leads` row, SMS, owner alert.
- Failure: if SMS fails, still alert owners; mark `leads.notes`.

### W02 Call logging and summary [P1]

- Trigger: Twilio `statusCallback` (call completed) and `recordingStatusCallback`.
- Steps:
  1. Upsert `calls` by `twilio_call_sid`; set `number_channel` from `tracking_numbers`.
  2. `first_time_caller` = no earlier call or lead with same `from_e164`.
  3. DNI match: if `to_number` is a tracking number, find the most recent DNI session for that channel in the last 30 minutes and copy its `gclid`.
  4. When recording ready: transcribe (Twilio transcription or Whisper via OpenAI API), Claude with `prompts/call-summary.md` returns JSON `{summary, year, make, model, running, area, quoted_price, outcome, objections}`.
  5. Upsert a `leads` row with `source='call'` and link.
  6. Beeper: short summary card.
- Failure: transcription failure leaves the call row intact; retry once after 10 minutes.

### W03 Missed-call text-back [P1]

- Trigger: Twilio call status `no-answer`, `busy`, or voicemail.
- Steps:
  1. Skip if the same number was texted in the last 24 hours or has a STOP in `consents`.
  2. SMS within 60s from the same number that was dialed: "Hi, it's {Brand}. Sorry we missed your call. What's the year, make and model? We'll text back a cash offer, or get one now: {site}/offer. Reply STOP to opt out."
  3. Record implied consent (`implied_inquiry`) in `consents`.
  4. Set `calls.text_back_sent_at`.
  5. Inbound SMS replies are routed by W04's SMS handler: customer messages are forwarded to Beeper and logged.
- Target: 100 percent of missed calls texted within 60s.

### W04 SMS command handler (owners + customers) [P1]

- Trigger: Twilio inbound SMS webhook.
- If sender is an owner number:
  - `DONE {paid} {year} {make} {model} [{area}] [SRC {channel}]` → insert `pickups`, link to most recent lead/call from that customer (owner can reply with the customer's phone as `DONE ... #6475551234` to force the link), trigger W06 in 2 hours, reply "Logged. Margin est ${x}."
  - `LOST {phone} {reason}` → `leads.status='lost'`
  - `PRICE car|truck run|dead {amount}` → new row in `scrap_prices` for today
  - `STATS` → today's numbers
- If sender is a customer:
  - `STOP` / `ARRET` → revoke consent in `consents`, confirm opt-out
  - `YES` in reply to a UGC consent request → `consents` `ugc_likeness`, update `media_assets.consent_status`
  - anything else → forward to Beeper, log on lead
- Revenue estimate for margin: `revenue_est` from a simple table (body type x running) until real scrap weights are wired in.

### W05 Google Ads offline conversions [P2]

- Trigger: Cron nightly 02:00.
- Steps: select `pickups` joined to `leads`/`calls` with a `gclid`/`gbraid`/`wbraid`, `ads_uploaded_at is null`, completed in the last 60 days. Upload via Google Ads API `ConversionUploadService.UploadClickConversions` with `conversion_action = pickup_completed`, `conversion_value = gross_margin`, `currency_code = CAD`, plus hashed phone for enhanced conversions. Mark uploaded.
- Also nightly: pull yesterday's cost by campaign into `spend_daily`.
- Failure: partial failures logged per row, retried next night.

### W06 Review request [P1]

- Trigger: called by W04 (2 hours after DONE), plus a daily cron for the 3-day reminder.
- Steps: SMS with the direct Google review link ("Tell people what car you sold and where"), one reminder at day 3 if no new review matched, then stop. Set `pickups.review_requested_at`.
- Never gate or incentivize reviews.

### W07 Review reply drafts [P2]

- Trigger: Cron hourly. Pull new reviews via Google Business Profile API into `reviews`.
- Steps: Claude with `prompts/review-reply.md`, create `approvals` row, post to Beeper. On approval (W99), publish reply via GBP API, set `reply_posted_at`.
- 1 to 2 star reviews: alert owners immediately, draft is marked "needs owner call first".

### W08 GBP weekly post [P3]

- Trigger: Cron Thursday 10:00.
- Steps: pick best approved photo/video from the week's `media_assets`, summarize the week's pickups (areas, vehicle types, no customer data), Claude drafts a 100 to 150 word update with area names, approval, publish via Postiz (GBP channel) or GBP API.

## Reporting

### W10 Monday scorecard [P2]

- Trigger: Cron Monday 07:30.
- Steps: query `weekly_scorecard`, `channel_cost_per_pickup`, `ai_visibility_weekly`, top `social_posts`, open `seo_tasks`. Claude writes a 10-line plain-language summary with 3 recommended actions. Post to Beeper; email copy to Matt.
- Alerts: Ads cost per pickup above threshold 2 weeks running, answer rate below 90 percent, rating drop, AI mention rate drop over 20 points.

### W11 Search Console pull [P3]

- Trigger: Cron Monday 05:00.
- Steps: Search Console API `searchanalytics.query` for last 7 days by page and query into `gsc_daily`; rules from `playbooks/local-seo.md` section 5 generate `seo_tasks`; Claude drafts title/meta suggestions.

### W12 Maintenance [P1]

- Trigger: Cron daily 03:00.
- Steps: ping Supabase (keeps free project active), delete Twilio recordings older than 90 days and null `calls.recording_url`, expire `approvals` older than 7 days, `pg_dump` via Supabase connection string to the Mac mini `~/backups/supabase/` (keep 14), monthly citation NAP check (fetch each `citations.url`, confirm phone and website appear).

## Outreach

### W09 Clay partner sync [P3]

- Trigger: Webhook `POST /webhook/clay-partner` (Clay HTTP API column).
- Steps: dedupe on domain then phone, compute `distance_km` from 125 Island Rd if Clay did not, upsert `partners`, assign `partner_code` (e.g. `SC-MECH-014`), set `next_touch_at`.
- Daily 08:00 cron: top 5 queued partners by score → Beeper "Today's partner visits/calls" with address, phone, talking points (Claude from `prompts/partner-brief.md`).
- Follow-ups per `playbooks/outreach.md` sequence; emails drafted by Claude, approved in Beeper, sent from the outreach Gmail account, max 30 per day.
- Gmail trigger on the outreach inbox: replies update `partners.status`.

### W16 Link target discovery and outreach [P4]

- Trigger: Cron weekly + Webhook `POST /webhook/clay-link`.
- Steps: SerpApi for the query list, upsert new domains into `link_targets`, mark `cited_by_ai` for URLs that appear in `ai_visibility_checks.cited_urls`. Prioritize `cited_by_ai = true`. Clay enriches contact. Claude drafts pitch with `prompts/outreach-pitch.md`. Approve, send, track.
- Monthly: check `backlinks` still live.

## Content

### W13 UGC intake [P2]

- Trigger: Telegram bot message with video/photo.
- Steps: download file, upload to Supabase Storage `ugc/raw/`, insert `media_assets`. Bot asks: "Area?" and "Customer visible? Y/N" (inline buttons). If Y: SMS the customer consent request (via the last pickup's phone), status `pending`. If N: `not_needed`.
- Photos also go to the GBP photo queue.

### W14 UGC processing [P2]

- Trigger: `media_assets.status = 'raw'` and consent is `granted` or `not_needed` (poll every 10 minutes).
- Steps (HTTP calls to the `media-worker` service on the mini, spec in `infra/media/README.md`; n8n's Execute Command node is disabled by default in recent versions and the n8n image has no ffmpeg):
  1. ffmpeg normalize to 1080x1920, 30 fps, loudness -14 LUFS.
  2. Plate and face blur. Set `blur_ok = true` only if the detector ran without error. Faces are kept only when consent is `granted`.
  3. whisper.cpp transcript → SRT → burned captions.
  4. Concatenate clips of the same pickup, add end card (logo + phone number for the brand).
  5. Claude with `prompts/social-captions.md` → `captions` JSON.
  6. Upload final to `ugc/final/`, status `ready`, create `approvals` row with a preview link.
- Failure: status `failed` with `error`; Beeper alert.

### W15 Social publish and metrics [P2]

- Trigger: approval via W99.
- Steps: Postiz API create post to connected channels (TikTok, Instagram, YouTube, Facebook, GBP) at the next open slot, one `social_posts` row per platform. Hard block if `blur_ok` is not true.
- Daily 06:00: pull metrics from Postiz analytics (fallback to platform APIs) into `social_posts`.

### W18 Location page drafts [P3]

- Trigger: Manual (form trigger in n8n with `area`).
- Steps: gather area facts from a brief (Beeper-typed notes or a Supabase row), recent `pickups` in that area, relevant `gsc_daily` queries, `ai_visibility_checks` answers for that area. Claude with `prompts/location-page.md` writes HTML matching the existing `junk-cars/scarborough.html` template. Output saved as a GitHub branch + PR via the GitHub node for human edit. Never auto-merged.

## AI search

### W17 AI visibility monitor [P2]

- Trigger: Cron Sunday 22:00.
- Steps:
  1. `run_id` = ISO week. Load active `ai_prompts`.
  2. For each prompt, in parallel batches of 5, call each engine:
     - ChatGPT: OpenAI Responses API with `web_search` tool, user location Toronto ON CA
     - Perplexity: Sonar API
     - Gemini: Gemini API with Google Search grounding
     - Claude: Messages API with web search tool
  3. Save raw answer and citations.
  4. Claude (cheap model) with `prompts/ai-answer-parse.md` extracts `{businesses: [{name, phone, url}], scrappy_mentioned, position, phone_correct}`.
  5. Insert `ai_visibility_checks`. Upsert cited URLs into `link_targets` (type guessed) with `cited_by_ai = true`.
- Output: `ai_visibility_weekly` view feeds W10.
- Cost guard: stop the run if more than 250 calls.

## Glue

### W00 Error alert

Error Trigger → Beeper ops room with workflow name, node, error, execution link.

### W99 Approval router

- Trigger: Beeper (Matrix) message in the approvals room, polled every minute via the Matrix `/sync` API, or n8n Matrix trigger if available.
- Parses `Y|N|E {short_id} [text]`, updates `approvals`, then calls the owning workflow's sub-workflow to publish.

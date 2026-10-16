# Scrappy Car GTM Engine

Automated, AI-assisted marketing system for Scrappy Car (scrap car removal, Scarborough and east GTA).
Owner: Matt. Operators: Marce Anthony and Ryan Basalt. Draft v1, 2026-09-29.

This folder is excluded from the Vercel deploy by `.vercelignore`, so nothing here is served on scrappycar.ca.
Secrets never go in git. Real values live in `marketing/infra/.env` (gitignored), n8n credentials, and Vercel env vars.

## Repo map

```
marketing/
  README.md                 strategy, stack, KPIs, rollout (this file)
  tracking-plan.md          PostHog + GA4 events, properties, funnels, attribution rules
  playbooks/
    local-seo.md            GBP, location pages, technical SEO, Search Console loop
    ai-search.md            getting recommended by ChatGPT, Gemini, Perplexity, Claude, Siri
    outreach.md             B2B referral partners (Clay), link building, citations, PR
    ugc-content.md          UGC capture, AI editing, free multi-platform posting
    paid-ads.md             Google Ads structure and offline conversion loop
    phone-and-forms.md      keep the number, port to Twilio, DNI, instant-offer form ported from carca.sh
  supabase/schema.sql       single source of truth for every lead, call, pickup, post, check
  n8n/workflows.md          spec for every automation (trigger, steps, output, failure mode)
  n8n/workflows/            exported n8n JSON, committed after each workflow is built
  prompts/                  versioned Claude prompts used by the workflows
  infra/docker-compose.yml  n8n + Cloudflare Tunnel on the Mac mini (Postiz as its own stack)
  infra/.env.example        every env var the stack needs, no values
  infra/media/README.md     media-worker spec (ffmpeg, plate blur, captions) for the UGC pipeline
  runbooks/setup.md         step-by-step build order, checklist style
```

## 1. The business

Local B2C service. Someone with a dead or unwanted car searches (or now asks an AI assistant) for "scrap car removal near me", calls the first credible result, gets a phone quote, books a pickup, gets cash.

Implications:

1. Demand already exists. We win on **visibility at the moment of intent** (Google Maps pack, organic, ads, AI assistant answers) and **speed of response**.
2. The phone call is the conversion. Call tracking and closing the loop from call to pickup to margin is the backbone of everything else.
3. Supply also comes from **businesses** that sit on junk cars (mechanics, body shops, used lots, property managers, estate lawyers). That is the B2B channel where Clay fits. Clay is not for finding individual consumers.
4. Trust sells. Real pickups, real owners, real reviews. That is why UGC and reviews carry more weight than polished ads.

## 2. North star and KPIs

North star: **completed pickups per week** and **gross margin per pickup**.

Monday scorecard (auto-generated from Supabase, texted to owners):

- Leads: calls (answered, missed, first-time), quote forms, partner referrals
- Conversion: quotes given, accepted, pickups completed
- Money: gross margin total and per car, cost per pickup by channel
- Speed: median answer time, missed-call recovery rate
- Reputation: new Google reviews, rating
- Visibility: Maps pack rank per area, organic clicks, AI assistant mention rate (see `playbooks/ai-search.md`)
- Content: posts published, views, profile visits, calls attributed to social

90-day targets (placeholders, lock after 2 weeks of baseline):

- 100 percent of missed calls texted back within 60 seconds
- 25 new Google reviews
- 12 live location pages, top 10 for "junk car removal [area]"
- Mentioned by at least 2 of 4 AI assistants for "scrap car removal Scarborough"
- 10 active referral partners
- 3 short-form videos per week across 5 platforms at zero posting cost
- Google Ads cost per pickup under one third of average margin per car

## 3. Stack

Already built on carca.sh (sister brand, Simcoe/Grey), reused here instead of rebuilt: Supabase project and `carcash_leads` table, PostHog project with form funnel events, Vercel serverless API (`quote`, `accept`, `vehicles`, `photo`), NHTSA vPIC make/model lookup, Vercel Blob photo uploads, Beeper (Matrix) lead alerts. Both brands share one Supabase, one PostHog project, one n8n, one scorecard, split by a `brand` field.

Free tier first. Paid only where free does not exist or breaks at our volume.

- **Automation: n8n Community, self-hosted (free)** on the Mac mini in Docker. Unlimited executions, native nodes for Supabase, PostHog, Twilio, Google, Anthropic, OpenAI, Telegram. Workflows export as JSON into `n8n/workflows/`. Make.com free is 1,000 ops per month, too small. Fallback: 5 USD per month VPS or n8n Cloud.
- **Public webhooks: Cloudflare Tunnel (free)**. No port forwarding on the home network.
- **Database: Supabase (free)**, Canada (Central) region. Postgres, Storage for UGC media, REST API. Pauses after 7 idle days, the daily jobs prevent that. Databricks is overkill for this scale; Postgres plus Supabase or Metabase dashboards covers it.
- **Analytics: PostHog Cloud (free)**. 1M events and 5k replays per month. Funnels, replays on the quote form, feature flags for A/B tests. GA4 stays because Google Ads bidding uses it.
- **B2B enrichment: Clay** for partner and link-target lists. Small batches on free credits; check current plan limits before scaling.
- **Social posting: Postiz, self-hosted (free, open source)**. Schedules to TikTok, Instagram, YouTube Shorts, Facebook, Google Business Profile, Threads, X, Pinterest, and more from one API that n8n calls. Fallback: Buffer free (3 channels).
- **Calls and SMS: Twilio** (about 1.50 CAD per number per month plus usage). Tracking numbers per channel, recording, transcription, missed-call text-back, SMS commands for owners. Alternative: CallRail.
- **Media processing: ffmpeg** on the mini (already installed on Matt's machine), plus the `clipify` and `cut-video` Claude skills for editing longer clips.
- **AI: Claude API** for writing and extraction. Also OpenAI, Perplexity, and Gemini APIs used only by the AI-visibility monitor, because we need to see what each assistant says.
- **Notifications and approvals: Beeper** (Matrix API, already wired in carca.sh). Drivers upload media through a Telegram bot.
- **Existing**: Vercel, Google Ads, GA4, Google Business Profile, Search Console.

Estimated run cost: 15 to 50 CAD per month plus ad spend.

## 4. System diagram

```
                     ┌────────────── DEMAND CAPTURE ──────────────┐
Search / Maps / AI ─►│ scrappycar.ca   GBP   Ads   social profiles │
                     └───────┬───────────────┬──────────────┬─────┘
                  PostHog+GA4│    tracking #s│   quote form │
                             ▼               ▼              ▼
                           ┌──────────── n8n (Mac mini) ────────────┐
Twilio calls/SMS ─────────►│ W01-W06 lead + call + pickup loop      │
Owner SMS "DONE ..." ─────►│ W07-W08 reviews + GBP                  │
Driver Telegram uploads ──►│ W13-W15 UGC → edit → approve → Postiz  │──► TikTok IG YT FB GBP
Clay tables ──────────────►│ W09, W16 partners + link outreach      │──► email / call lists
Cron ─────────────────────►│ W10-W12, W17 scorecard, GSC, AI checks │
                           └───────────────┬────────────────────────┘
                                           ▼
                                  Supabase (Canada)
                            leads calls pickups partners
                        media_assets posts ai_visibility gsc
                                           │
                     Google Ads offline conversions ◄─┘
```

## 5. Channels

Priority order. Each has a playbook with the how.

1. **Google Business Profile and reviews**: most local junk car searches end in the Maps pack. `playbooks/local-seo.md`
2. **Speed to lead**: keep (647) 204-4200, port it to Twilio for ring groups and missed-call text-back, add the instant-offer form from carca.sh. `playbooks/phone-and-forms.md`
3. **Google Ads with offline conversions**: bid on margin, not rings. `playbooks/paid-ads.md`
4. **Local and topical SEO**: 12 location pages plus high-intent topic pages. `playbooks/local-seo.md`
5. **AI search visibility (GEO)**: be the business ChatGPT, Gemini, Perplexity, Claude, and Siri name. `playbooks/ai-search.md`
6. **UGC short-form video**: real pickups posted free to 5+ platforms. `playbooks/ugc-content.md`
7. **B2B referral partners and link outreach**: Clay-powered. `playbooks/outreach.md`

## 6. Human in the loop

Anything public (review replies, GBP posts, social posts, page copy, outreach emails) is drafted by AI and approved by a human with a one-tap SMS or Telegram reply before it goes out. Autonomous publishing risks a wrong price, a visible license plate, or a promise the team cannot keep. Internal data work (logging, scoring, enrichment, reports) runs fully automatic.

## 7. Compliance (Canada)

- **CASL**: commercial SMS and email need consent. Quote form uses an unticked consent box. Callers who request a quote give implied consent for 6 months. Every message has the business name and "Reply STOP to opt out". Consent source and timestamp stored in `consents`. B2B cold email is only sent to conspicuously published business addresses, relevant to their role, with an unsubscribe link.
- **PIPEDA**: call recording notice on the line, recordings deleted after 90 days, data in Canada region, privacy page on the site.
- **UGC**: written consent (SMS "YES") from any customer who appears or whose property appears. License plates and house numbers blurred before posting.
- **Platform rules**: no scraping or auto-messaging on Kijiji or Facebook Marketplace, no fake reviews, no astroturfing on Reddit or forums. These get accounts banned and poison AI-search trust signals.

## 8. Rollout

Step-by-step checklist in `runbooks/setup.md`. Summary:

- **Week 1, foundations**: Supabase schema, PostHog install, n8n + Postiz + tunnel on the mini, Twilio numbers, GCLID and UTM capture, `.vercelignore`, `llms.txt`, AI crawler access in `robots.txt`.
- **Weeks 2 to 3, close the loop**: call logging, missed-call text-back, pickup SMS command, offline conversions, review engine. Collect baseline.
- **Weeks 4 to 6, visibility**: citations and NAP cleanup, 10 new location pages, instant quote form, GBP posting, AI-visibility monitor, UGC pipeline live.
- **Weeks 7 to 12, scale**: Clay partner program, link outreach, ads split by geography, move budget to channels with lowest cost per pickup.

## 9. Open decisions

- Mac mini vs VPS for n8n and Postiz
- Port (647) 204-4200 to Twilio (recommended) vs conditional forwarding vs CallRail
- "Guaranteed" offer wording on the form: only if the team honours it at pickup
- Referral fee per car (suggest 50 CAD)
- Who approves drafts day to day
- Scrap price source for instant estimates
- Separate sending domain for cold outreach (suggest `scrappycarco.ca` or similar, to protect `scrappycar.ca` deliverability)

# Runbook: Build Order

Checklist. Do these in order; each step says what "done" looks like. Owner in brackets.

## Week 1: foundations

- [ ] **Repo hygiene** [Matt]: `.vercelignore` excludes `marketing/`; `.gitignore` excludes `.env`, `marketing/infra/.env`, `marketing/infra/backups/`. Done when `vercel build` output has no `marketing/` files.
- [ ] **Supabase** [Matt]: use the existing carca.sh project if it's in the Canada region, otherwise create a new one in Canada (Central) and move carca.sh over. Run `marketing/supabase/schema.sql`. Migrate `carcash_leads` into `leads` with `brand='carcash'`, then create a `carcash_leads` compatibility view. Done when both sites' tables exist and carca.sh still inserts successfully.
- [ ] **Confirm prices** [Marce/Ryan]: fill real Scrappy Car numbers in `scrap_prices`.
- [ ] **PostHog on scrappycar.ca** [Matt]: same snippet and project key as carca.sh, add `brand` super property, events from `tracking-plan.md` for phone clicks. Done when events show in PostHog Live.
- [ ] **Attribution script** [Matt]: first/last touch capture into `sc_attr`, channel rules, including `ai_assistant` referrers.
- [ ] **AI crawler access** [Matt]: `robots.txt` updated, `llms.txt` published, schema `sameAs` added.
- [ ] **Citations** [Marce/Ryan with Matt]: claim and match NAP on Bing Places, Apple Business Connect, Yelp, Facebook. Update `citations` rows.
- [ ] **Mac mini** [Matt]: install Docker Desktop (or OrbStack), set the mini to never sleep and auto-restart after power failure (System Settings > Energy). `cd marketing/infra && cp .env.example .env`, fill n8n + tunnel values, `docker compose up -d`. Done when `https://hooks.scrappycar.ca/webhook-test/ping` reaches n8n.
- [ ] **Cloudflare Tunnel** [Matt]: DNS for scrappycar.ca must be on Cloudflare, or use a subdomain of a Cloudflare-managed domain. Public hostname routes only `/webhook*` to n8n; the editor stays LAN-only.
- [ ] **Twilio** [Matt]: account, buy a temporary local 647/416 number, start port-in of (647) 204-4200 (see `playbooks/phone-and-forms.md`). Meanwhile set carrier no-answer forwarding to the temporary number (Option B).

## Weeks 2 to 3: close the loop

- [ ] W00 error alert, W12 maintenance (backups + keep-alive) first, so everything after is safe.
- [ ] W03 missed-call text-back on the forwarding number. Test: call, don't answer, text arrives within 60s.
- [ ] W04 SMS commands. Test: owner texts `DONE 300 2010 Civic Ajax`, row appears in `pickups`, reply received.
- [ ] W06 review requests. Test on a team member's phone.
- [ ] W02 call logging (full version after port completes).
- [ ] Twilio port cutover (Sunday evening), then full call flow: simultaneous ring, whisper, recording notice, after-hours voicemail.
- [ ] W05 offline conversions: create `pickup_completed` conversion action in Google Ads (import, click-based), link developer token.
- [ ] W07 review replies.
- [ ] Two weeks of baseline data, then lock KPI targets in `README.md`.

## Weeks 4 to 6: conversion and visibility

- [ ] Port the instant-offer form from carca.sh (`playbooks/phone-and-forms.md` section 3). Deploy to a Vercel preview, test end to end, then production.
- [ ] W01 form intake with SMS speed-to-lead.
- [ ] DNI script with Ads and social tracking numbers.
- [ ] W17 AI visibility monitor, first baseline run.
- [ ] Postiz stack up, connect TikTok, Instagram, Facebook, YouTube, GBP.
- [ ] Telegram bot, W13 intake. Drivers start filming.
- [ ] media-worker built, W14 and W15. Until then, manual edit path.
- [ ] W18 location page drafts: Port Union, West Rouge, Rouge Hill, Highland Creek, Ajax first. Human edit, merge, submit sitemap.
- [ ] W08 GBP weekly post, W10 scorecard, W11 Search Console.

## Weeks 7 to 12: supply and scale

- [ ] Clay tables for partners, W09 live, first 30 partner conversations.
- [ ] W16 link targets, prioritize URLs AI assistants cite.
- [ ] Google Ads split by geography, first RSA refresh.
- [ ] `/scrap-car-value`, `/sell-car-without-ownership-ontario`, and other topic pages.
- [ ] Month-end review of `channel_cost_per_pickup`; move budget.

## Definition of done for the whole system

- Every call, form, and pickup lands in Supabase with a channel.
- Owners' only manual inputs: answer calls, text `DONE ...`, film pickups, tap approvals.
- Monday scorecard arrives without anyone touching it.
- Any workflow failure pings the ops room within a minute.
- `n8n/workflows/*.json` in git matches what runs in n8n.

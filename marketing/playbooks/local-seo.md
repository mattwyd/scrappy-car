# Playbook: Local SEO and Google Business Profile

Goal: top 3 in the Maps pack and top 10 organic for "junk car removal / scrap car removal / cash for junk cars + [area]" across every service area.

## 1. Google Business Profile (GBP)

The Maps pack is ranked on relevance, distance, and prominence. Distance we can't change; the other two we can.

Setup checklist:

- Primary category: the closest match available among "Car buyer", "Junk car buyer" / "Scrap car removal" style categories. Secondary: "Towing service", "Scrap metal dealer". Re-check quarterly, Google adds categories.
- Service-area business with every area from the site listed. Address hidden only if customers don't visit Island Rd.
- Hours 7am to 9pm, 7 days. Holiday hours set every holiday (Google rewards this).
- Services list with a description for each (Scrap car removal, Cash for junk cars, Free towing, Same-day pickup, Unwanted car removal, Accident car removal).
- Q&A: seed 8 to 10 real questions from calls (ownership, payment, timing) and answer them.
- Photos: logo, cover, truck, owners, and a fresh real pickup photo every week (UGC pipeline feeds this automatically).
- Products: "Scrap car pickup: $200 to $1,500+" etc. Products show prominently on mobile.
- Booking/Call link uses the GBP tracking number, website link uses `?utm_source=google&utm_medium=organic&utm_campaign=gbp`.

Automations:

- **W06 Review requests**: SMS 2 hours after pickup with the direct review link. One reminder after 3 days. Ask customers to mention the car and the area ("Tell people what car you sold and where"), which feeds both Maps relevance and AI assistants. Never offer payment for reviews, never gate (asking only happy customers).
- **W07 Review replies**: every new review pulled hourly, Claude drafts a reply that names the service and area naturally, owner approves by SMS "Y".
- **W08 GBP posts**: weekly "Update" post built from real pickups that week, with a photo from the UGC library. Postiz can publish to GBP; n8n can also call the Business Profile API directly.

Targets: 4.8+ rating, reviews velocity of 2 to 3 per week (steady beats bursts).

## 2. Citations and NAP consistency

Name, address, phone must match exactly everywhere. Canonical form:

```
Scrappy Car
125 Island Rd, Scarborough, ON M1C 4Z2
(647) 204-4200
https://scrappycar.ca
```

Priority listings (these also feed AI assistants, see `ai-search.md`):

1. Google Business Profile
2. Bing Places (feeds ChatGPT and Copilot)
3. Apple Business Connect (feeds Siri, Apple Maps, Apple Intelligence)
4. Yelp (feeds Apple Maps, Perplexity and others)
5. Facebook page
6. Yellow Pages Canada, 411.ca, Canada411
7. Foursquare, HotFrog, Cylex, iGlobal, Brownbook
8. BBB (if accreditation makes sense)
9. Waze (for the Island Rd location)
10. Industry: Ontario auto recyclers directories, OARA if eligible

Track each listing in Supabase `citations` with status, URL, and last checked date. W12 checks monthly that phone and URL still match.

## 3. Site structure

Current: homepage, `/junk-cars`, `/junk-cars/scarborough`, `/junk-cars/pickering`. Homepage lists 12 areas, so 10 are missing.

Target structure:

```
/                                  hub, Scarborough focus
/junk-cars                         area index
/junk-cars/{area}                  one per area (12+)
/scrap-car-value                   instant estimate + how scrap value is calculated
/sell-car-without-ownership-ontario
/same-day-junk-car-removal
/sell-car-failed-safety-emissions
/accident-car-removal
/how-it-works
/reviews                           embedded real reviews + UGC videos
/about                             Marce and Ryan, with photos
/privacy
```

Location page rules (Google demotes near-duplicate city pages):

- Unique intro that references real local context: neighbourhoods, main roads, drive time from Island Rd, typical cars we pick up there.
- A "Recent pickups in {area}" block fed from Supabase `pickups` (year/make/model, month, no customer data). Rebuilt on each deploy or by a small Vercel function.
- 1 to 2 embedded UGC videos filmed in that area when available.
- Area-specific FAQ (Durham vs Toronto differences, parking/towing access in condos, etc.).
- `Service` + `FAQPage` + `BreadcrumbList` schema, `areaServed` set to the area.
- Internal links: hub to area, area to 2 nearest areas, area to topic pages.

Content workflow (W18 below): Claude drafts from `prompts/location-page.md` plus a brief (area facts, pickup data), human edits for accuracy and voice, commit, deploy. Never publish unedited AI pages.

## 4. Technical SEO checklist

- Sitemap lists every page, auto-regenerated on deploy. Submit in Search Console and Bing Webmaster Tools.
- `robots.txt` allows search and AI crawlers (see `ai-search.md`).
- Core Web Vitals: site is static and light, keep it that way. Compress `truck.jpg` to WebP, lazy-load below-the-fold media, host videos on YouTube and embed with a facade.
- Canonical tags on every page, `cleanUrls` already on.
- Title pattern: `Junk Car Removal {Area} | Cash for Cars, Free Towing | Scrappy Car`.
- Click-to-call button sticky on mobile.
- IndexNow ping on deploy (Bing, Yandex; also helps ChatGPT search freshness via Bing).

## 5. Search Console loop (W11)

Weekly n8n job:

1. Pull last 28 days of queries and pages from Search Console API into `gsc_daily`.
2. Flag: pages with impressions up but CTR under 3 percent, queries ranking 8 to 20 (striking distance), new queries with no matching page.
3. Claude proposes title/meta rewrites and new page ideas, written into `seo_tasks`.
4. Summary goes into the Monday scorecard.

## 6. Rank tracking

Free approach: n8n weekly job checks Maps rank using a grid of points (Scarborough, Pickering, Ajax, Markham, North York centroids) via a SERP API free tier (for example SerpApi 100 searches per month free) for 3 core keywords. Store in `rank_checks`. Upgrade to a paid local rank grid tool only if the free tier runs out.

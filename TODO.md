# Scrappy Car TODO

Current state as of Oct 28, 2026. The older build plan is in `marketing/runbooks/setup.md`.

## Running now

- **Instant offer** shows a range: low = the flat ladder, high = the yard's likely price minus $100, always at least $50 apart (`api/_lib.js`).
- **Follow-up emails** to leads still at "Offer sent", on day 1, 5 and 21, from hello@scrappycar.ca through Resend. Stops when the deal moves, on unsubscribe, bounce or spam complaint. Daily cron at 10am Toronto (`api/followups.js`). Turn off by removing `FOLLOWUPS_LIVE` in Vercel.
- **Lead alerts** by email from alerts@scrappycar.ca (Gmail as fallback) and Beeper.
- **Email stats** in PostHog: `followup_sent`, `followup_clicked`, `followup_delivered`, `followup_bounced`, `followup_complained`.
- **Books (P&L)**: private page at `/books` (link with key in `scrappy-car-private/books-link.txt`). P&L email on the 1st, missing-price reminder on Mondays (`api/books-daily.js`).
- **Google Ads spend** sent daily 5 to 6am by the "Scrappy Car books: daily ad spend" script in Google Ads.
- **HubSpot**: deal page shows the "Scrappy Car deal" card; fields grouped into money, car, lead source, follow-ups; test deals marked Lost as "Test or duplicate".
- **Site** matches the Google profile: schema name "Scrappy Car - Junk Cars, Cars 4 Cash" (alternate "Scrappy Car"), open 24 hours, links to the profile and Instagram, city in the home H1, schema links to the Google listing, map shows the listing, address 125 Island Rd, M1C 2P7 everywhere (matches the Google profile), social card image, compressed truck photo, no em dashes. Submitted to Bing with IndexNow.

## Every pickup (Sean)

- [ ] When a deal moves to **Picked up**, fill in "Sold to yard for", "Paid to customer" and, if any, "Job costs" on the deal. The P&L reads these.
- [ ] When a deal is **Lost**, pick a "Lost reason".
- [ ] Add other expenses (gas, insurance, phone) on the Books page.

## Needs a sign-in (do one at a time in the browser pane)

- [ ] **Google Business Profile** stays as it is (Matt's rule: when the site and the profile disagree, change the site; editing the profile risks re-verification and trust). Still worth doing there without editing facts: reply to the new 5-star review and ask every pickup for a review. Two values on the profile look wrong, left alone for now: the address is 125 Island Rd while the yard is at 115 (the site shows 125 to match, Matt's call on Oct 28), and the website link is https://scrappycar.net/ (a redirect; https://scrappycar.ca/?utm_source=google&utm_medium=organic&utm_campaign=gbp would also make profile visits show as "gbp" in PostHog).
- [x] **Cloudflare Email Routing**: hello@scrappycar.ca forwards to mattproct@gmail.com (added Oct 28). Rules allow one destination each; forwarding to both of us would need an Email Worker. alerts@ is still dropped, on purpose.
- [x] **Google Search Console**: https://scrappycar.ca/ verified Oct 28 through the Google Analytics tag (keep that tag on the site), sitemap submitted. Check the sitemap status leaves "Couldn't fetch" within a few days.
- [x] **Bing Webmaster Tools**: imported from Search Console Oct 28; sitemap read successfully, 6 pages found and crawled. Check Search Performance and the AI Performance report there in a couple of weeks.
- [ ] **Bing Places**: claim the listing (feeds ChatGPT, Copilot, Alexa). Skipped Oct 28: "Continue with Google" kept looping back to the sign-in page in Chrome (likely third-party cookies). Next try: sign in with a Microsoft account, then Add business > Import from Google Business Profile, so nothing differs from Google.
- [ ] **Apple Business Connect**: claim the listing (Apple Maps, Siri).
- [ ] **Yelp, Facebook page, YellowPages.ca, 411.ca**: same name, address and phone everywhere. Then add the profile URLs to the schema `sameAs` on the site.
- [ ] **HubSpot to Google Ads link** (Data Manager): send "Picked up" deals back as a conversion so Ads optimizes for real pickups, not just form fills.
- [ ] **Google Ads**: the ad says "Up to $4000 for Your Junk Car", but offers and yard quotes top out around $1,500. Change it or Google may call it misleading. Also widen the location targeting; spend is well under budget.
- [ ] Optional: turn on CAD in HubSpot (the account only has USD, so amounts show as US dollars).

## Needs a decision

- [ ] About Us names "Marce Anthony" and "Ryan Basalt": real, or replace?
- [ ] Billing name typo "Scappy Car Ltd".

## Worth building next

- [ ] A real scrap price guide page from the yard quote data (prices by car type, what changes the price). Unique data is what gets cited by AI answers. Muse's `/scrap-car-value` page in PR #1 was a template shell, so it wasn't merged.
- [ ] City pages for Ajax, Whitby, Oshawa, Markham, North York, East Toronto, only with real local content (pickups done there, local photos, area FAQs). Muse's versions were 95 to 98% identical with the city swapped, which Google treats as doorway pages.
- [ ] Offer form: photo step loses people on iOS; progress is lost on reload.
- [ ] Missed-call text-back and review requests (`marketing/runbooks/setup.md` weeks 2 to 3).
- [ ] After two weeks of data, set KPI targets (leads a week, pickup rate, cost per pickup).

## Can't do on free HubSpot

- Required fields when a deal enters a stage. The Monday missing-price reminder covers it.

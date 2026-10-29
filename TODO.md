# Scrappy Car TODO

Current state as of Oct 28, 2026. The older build plan is in `marketing/runbooks/setup.md`. Private files (keys, the yard quote data) live outside the repo in `~/Documents/vibing/scrappy-car-private/`.

## Pick up here next

1. **Bing Places**: "Continue with Google" never kept the session (tried Oct 28). Try a Microsoft account, then Add business > Import from Google Business Profile.
2. **Yelp, Facebook page, YellowPages.ca, 411.ca** with the same details, then add their URLs to the schema `sameAs` in `index.html` and the three `junk-cars/` pages that carry the business schema.
3. **Apple Business** (on hold, Oct 28): organization "Scrappy Car Ltd" exists on Matt's existing Apple Account (brand and location features only). Verification needs two methods and Matt can't verify the business yet. Domain Validation is half done: the `apple-domain-verification` TXT record is live at the scrappycar.ca root in Cloudflare (keep it), it just needs Verify clicked. The second method is a document upload (Certificate of Incorporation, business registration, utility bill or lease) in the name "Scrappy Car Ltd". After that, add the location with exactly the Google profile details: "Scrappy Car - Junk Cars, Cars 4 Cash", 125 Island Rd, Scarborough, ON M1C 2P7, (647) 204-4200, open 24 hours, https://scrappycar.ca, auto wrecker.
4. **HubSpot to Google Ads link** (parked Oct 28): Google Ads > Data manager > HubSpot > "Use direct connection" > Authorize failed with "Failed to authorize access", and no Google app got installed in HubSpot (portal mQinc is the right one). Worth little until the campaign bids on conversions: "Maximize clicks" ignores them, and Books already shows cost per pickup by channel. Retry when pickups reach about 15 a month and bidding moves to Maximize conversions. The site already sends hashed email and phone with the offer conversion (enhanced conversions for leads), so matching will work once it connects.

Open anything that needs a sign-in in Chrome (Claude in Chrome), not the built-in browser pane, where sign-ins don't stick. Matt does every sign-in, OAuth approval and account creation himself.

## Rules

- **The Google Business Profile stays unchanged.** When the site and the profile disagree, the site changes to match (Matt, Oct 28). Ask before treating a profile value as wrong.
- **HubSpot is optional.** Quotes, accepts and alerts never wait on or fail because of HubSpot.
- The repo is public: no customer data, yard name or keys in it.

## Running now

- **Instant offer** shows a range: low = the flat ladder, high = the yard's likely price minus $100, always at least $50 apart (`api/_lib.js`).
- **Follow-up emails** to leads still at "Offer sent", on day 1, 5 and 21, from hello@scrappycar.ca through Resend. Stops when the deal moves, on unsubscribe, bounce or spam complaint. Daily cron at 10am Toronto (`api/followups.js`, copy in `api/_followups.js`). Live since Oct 28: the first run sent 5 emails (three first emails, two second emails), all delivered. Turn off by removing `FOLLOWUPS_LIVE` in Vercel and redeploying; `?dry=1` with the cron secret shows who would get what.
- **Lead alerts** by email from alerts@scrappycar.ca (Gmail as fallback) and Beeper.
- **Google tag** (Ads and GA4) only reports from scrappycar.ca. On Vercel previews and localhost `gtag` is a no-op, so test quotes never count as conversions; PostHog tags those visits `env: preview` or `dev`. Don't accept the vercel.app "suggested domains" in the Google tag settings.
- **Email domain**: scrappycar.ca verified in Resend (DKIM, SPF, bounce MX and a monitor-only DMARC in Cloudflare DNS). Cloudflare Email Routing forwards hello@ and matt@ to Matt's Gmail, seanq@ to Sean's.
- **Search**: Google Search Console verified through the Google Analytics tag (keep the tag), sitemap read (6 pages). Bing Webmaster Tools imported from Search Console, all 6 pages crawled. IndexNow key file at the site root pushes changed pages to Bing.
- **Email stats** in PostHog: `followup_sent`, `followup_clicked`, `followup_delivered`, `followup_bounced`, `followup_complained`.
- **Books (P&L)**: private page at `/books` (link with key in `scrappy-car-private/books-link.txt`). P&L email on the 1st, missing-price reminder on Mondays (`api/books-daily.js`).
- **Google Ads spend** sent daily 5 to 6am by the "Scrappy Car books: daily ad spend" script in Google Ads.
- **HubSpot**: deal page shows the "Scrappy Car deal" card; fields grouped into money, car, lead source, follow-ups; test deals marked Lost as "Test or duplicate".
- **Site** matches the Google profile: schema name "Scrappy Car - Junk Cars, Cars 4 Cash" (alternate "Scrappy Car"), open 24 hours, links to the profile and Instagram, city in the home H1, schema links to the Google listing, map shows the listing, address 125 Island Rd, M1C 2P7 everywhere (matches the Google profile), social card image, compressed truck photo, no em dashes. Submitted to Bing with IndexNow.

## Every pickup (Sean)

- [ ] When a deal moves to **Picked up**, fill in "Sold to yard for", "Paid to customer" and, if any, "Job costs" on the deal. The P&L reads these.
- [ ] When a deal is **Lost**, pick a "Lost reason".
- [ ] Add other expenses (gas, insurance, phone) on the Books page.
- [ ] Ask for a Google review with the profile's "Ask for reviews" link, and reply to new reviews.

## Needs a sign-in (one at a time, in Chrome)

- [ ] **Google Business Profile** stays as it is (Matt's rule: when the site and the profile disagree, change the site; editing the profile risks re-verification and trust). Still worth doing there without editing facts: reply to the new 5-star review and ask every pickup for a review. Two values on the profile look wrong, left alone for now: the address is 125 Island Rd while the yard is at 115 (the site shows 125 to match, Matt's call on Oct 28), and the website link is https://scrappycar.net/ (a redirect; https://scrappycar.ca/?utm_source=google&utm_medium=organic&utm_campaign=gbp would also make profile visits show as "gbp" in PostHog).
- [x] **Cloudflare Email Routing**: hello@scrappycar.ca forwards to Matt's Gmail (added Oct 28). Rules allow one destination each; forwarding to both of us would need an Email Worker. alerts@ is still dropped, on purpose.
- [x] **Google Search Console**: https://scrappycar.ca/ verified Oct 28 through the Google Analytics tag (keep that tag on the site), sitemap read successfully Oct 28 (6 pages).
- [x] **Bing Webmaster Tools**: imported from Search Console Oct 28; sitemap read successfully, 6 pages found and crawled. Check Search Performance and the AI Performance report there in a couple of weeks.
- [ ] **Bing Places**: claim the listing (feeds ChatGPT, Copilot, Alexa). Skipped Oct 28: "Continue with Google" kept looping back to the sign-in page in Chrome (likely third-party cookies). Next try: sign in with a Microsoft account, then Add business > Import from Google Business Profile, so nothing differs from Google.
- [ ] **Apple Business** (Apple Maps, Siri): on hold until there is a document to verify the business; see "Pick up here next".
- [ ] **Yelp, Facebook page, YellowPages.ca, 411.ca**: same name, address and phone everywhere. Then add the profile URLs to the schema `sameAs` on the site.
- [ ] **HubSpot to Google Ads link** (Data Manager): parked, see "Pick up here next".
- [ ] **Google Ads second admin**: tag diagnostics asks for a second administrator so the account can't get locked out. Invite Sean (Admin > Access and security).
- [ ] **Google Ads**: the ad says "Up to $4000 for Your Junk Car", but offers and yard quotes top out around $1,500. Change it or Google may call it misleading. Also widen the location targeting; spend is well under budget.
- [ ] Optional: turn on CAD in HubSpot (the account only has USD, so amounts show as US dollars).

## Needs a decision

- [ ] About Us names "Marce Anthony" and "Ryan Basalt": real, or replace?
- [ ] Billing name typo "Scappy Car Ltd".
- [ ] PR #1 (Muse's SEO PR) is merged up to 464a73f. Only Muse's last commit (b7e8da6, templated city and guide pages) is left, and it now conflicts with main. Close it or keep it as a reference.

## Worth building next

- [ ] A real scrap price guide page from the yard quote data (prices by car type, what changes the price). Unique data is what gets cited by AI answers. Muse's `/scrap-car-value` page in PR #1 was a template shell, so it wasn't merged.
- [ ] City pages for Ajax, Whitby, Oshawa, Markham, North York, East Toronto, only with real local content (pickups done there, local photos, area FAQs). Muse's versions were 95 to 98% identical with the city swapped, which Google treats as doorway pages.
- [ ] Offer form: photo step loses people on iOS; progress is lost on reload.
- [ ] Missed-call text-back and review requests (`marketing/runbooks/setup.md` weeks 2 to 3).
- [ ] After two weeks of data, set KPI targets (leads a week, pickup rate, cost per pickup).

## Can't do on free HubSpot

- Required fields when a deal enters a stage. The Monday missing-price reminder covers it.

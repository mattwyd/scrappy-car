# Scrappy Car TODO

Current state as of Oct 28, 2026. The older build plan is in `marketing/runbooks/setup.md`. Private files (keys, the yard quote data) live outside the repo in `~/Documents/vibing/scrappy-car-private/`.

## Pick up here next

0. **Call sheet** (Nov 3): done and tested live, including calendar invites and cancellations. HubSpot is fully gone (code, docs, Airtable and Vercel). The old HubSpot-import Airtable base is in Airtable's trash; its contacts and call notes were copied into the CRM first. Imported leads got "Follow-up Emails Sent" set to what the old schedule had already sent, since their Airtable created date is Nov 3. An invite sent to hello@scrappycar.ca never reaches Gmail (the forwarding drops mail from our own domain), so test with a real inbox.
1. **Yelp, Facebook page, YellowPages.ca, 411.ca** with the same details, then add their URLs to the schema `sameAs` in `index.html` and the three `junk-cars/` pages that carry the business schema.
2. **Apple Business** (on hold, Oct 28): organization "Scrappy Car Ltd" exists on Matt's existing Apple Account (brand and location features only). Verification needs two methods and Matt can't verify the business yet. Domain Validation is half done: the `apple-domain-verification` TXT record is live at the scrappycar.ca root in Cloudflare (keep it), it just needs Verify clicked. The second method is a document upload (Certificate of Incorporation, business registration, utility bill or lease) in the name "Scrappy Car Ltd". After that, add the location with exactly the Google profile details: "Scrappy Car - Junk Cars, Cars 4 Cash", 125 Island Rd, Scarborough, ON M1C 2P7, (647) 204-4200, open 24 hours, https://scrappycar.ca, auto wrecker.
3. **Offline conversions to Google Ads** (parked): send picked-up leads from Airtable to Google Ads as conversions (a scheduled upload with gclid or the hashed email and phone the site already sends). Worth little until the campaign bids on conversions: "Maximize clicks" ignores them, and Books already shows cost per pickup by channel. Build it when pickups reach about 15 a month and bidding moves to Maximize conversions.

Open anything that needs a sign-in in Chrome (Claude in Chrome), not the built-in browser pane, where sign-ins don't stick. Matt does every sign-in, OAuth approval and account creation himself.

## Rules

- **The Google Business Profile stays unchanged.** When the site and the profile disagree, the site changes to match (Matt, Oct 28). Ask before treating a profile value as wrong.
- **Airtable is optional.** Quotes, accepts, calls and alerts never wait on or fail because of Airtable or Google Calendar; whatever doesn't save goes in the alert email.
- The repo is public: no customer data, yard name or keys in it.

## Running now

- **Instant offer** shows a range: low = the flat ladder, high = the yard's likely price minus $100, always at least $50 apart (`api/_lib.js`).
- **Follow-up emails** to leads still at "New lead" with an offer, on day 1, 5 and 21, from hello@scrappycar.ca through Resend. Stops when the lead is booked or lost, when they accept on the website, on unsubscribe, bounce or spam complaint. Airtable keeps only the low end of the offer, so the emails price the top of the range again from the car. Daily cron at 10am Toronto (`api/followups.js`, copy in `api/_followups.js`). Live since Oct 28: the first run sent 5 emails (three first emails, two second emails), all delivered. Turn off by removing `FOLLOWUPS_LIVE` in Vercel and redeploying; `?dry=1` with the cron secret shows who would get what.
- **Lead alerts** by email from alerts@scrappycar.ca (Gmail as fallback) and Beeper.
- **Google tag** (Ads and GA4) only reports from scrappycar.ca. On Vercel previews and localhost `gtag` is a no-op, so test quotes never count as conversions; PostHog tags those visits `env: preview` or `dev`. Don't accept the vercel.app "suggested domains" in the Google tag settings.
- **Email domain**: scrappycar.ca verified in Resend (DKIM, SPF, bounce MX and a monitor-only DMARC in Cloudflare DNS). Cloudflare Email Routing forwards hello@ and matt@ to Matt's Gmail, seanq@ to Sean's.
- **Search**: Google Search Console verified through the Google Analytics tag (keep the tag), sitemap read (6 pages). Bing Webmaster Tools imported from Search Console, all 6 pages crawled. Bing Places listing imported from Google and verified, waiting to publish. IndexNow key file at the site root pushes changed pages to Bing.
- **Email stats** in PostHog: `followup_sent`, `followup_clicked`, `followup_delivered`, `followup_bounced`, `followup_complained`.
- **Books (P&L)**: one month at a time, Google Ads spend from the Ads script summed per month and set against leads whose Channel is google_ads (the site saves Channel on every quote; /call asks the caller). Deals count by their lead's current stage (Closed counts, Appointment Scheduled and Picked up show under Upcoming, anything else drops out); the daily job gives every booked, picked-up or closed lead a P&L row. Pickup times aren't in Airtable, so a deal is dated by when its P&L row was made (about the booking day). Private page at `/books` (link with key in `scrappy-car-private/books-link.txt`). P&L email on the 1st, missing-price reminder on Mondays (`api/books-daily.js`).
- **Google Ads spend** sent daily 5 to 6am by the "Scrappy Car books: daily ad spend" script in Google Ads.
- **Google Ads negatives** (57 on the search-ad campaign): the keywords all target sellers, but phrase match lets Google treat "auto wreckers scarborough" as a close variant of "scrap car scarborough", and 6 of 7 clicks in the week to Oct 28 were people looking for parts. Oct 29 added broad negatives for wrecker searches (wrecker, wreckers, wreckage, autowreckers), yards (scrapyard, scrapyards, graveyard), self-serve yards (pick and pull, pick n pull, u pull, upull, you pull, kenny, self serve), recyclers and scrap metal (auto recyclers, auto recycling, metal, copper, aluminum) and competitor names (hollywood, greenlane, mountain auto, starks, bell city, acorn, auto heaven). Check the search terms report weekly and add new parts searches as negatives.
- **Airtable** is the CRM: base "Lead & Pricing CRM". Leads in "CRM - Intake & Pricing" (the site, /call and follow-ups read and write it), closed deals in "Closed Leads P&L" (Books reads it; the daily Books job adds a row when a lead is booked), plus Steve's pricing guide and quote history (the leads table has no Steve fields). Intake Source says where each lead came from (Website, Phone call). Stages are New lead (every website quote or phone lead, accepted or not), Appointment Scheduled, Picked up (we have the car), Closed (sold), or Lost. Matt simplified the leads table on Nov 3: no Steve fields, Vehicle Type, Referrer, First Channel, Pickup Date or Pickup Window. Don't add fields back without asking. Photo URLs is long text, one link per line. Accepting on the website adds a dated "Accepted the offer on the website" line to Call Notes and stops the follow-ups; the lead stays a New lead.
- **Call sheet** at `/call` (same private link key as `/books`): the page to have open on a call, laid out as a flowchart. Two starts: a website lead (pick from open leads or search by phone, updates that Airtable lead) or a new caller (enter their number, saves a new lead). Live offer range from the same pricing as the site, scripts and objection answers, exact pickup address, then books a 1-hour pickup window (8am to 10pm). No ownership question (assumed) and no agreed price: a pickup is booked on the range, and what they hope to get goes in Notes (the box in the Offer step and the side panel are the same notes). Booking emails a calendar invite from hello@ to the customer (if they gave an email) and to the team with the details; Gmail puts both on Google Calendar, which is the only record of pickup times: the sheet can't see what's taken (check the calendar), and marking a booked lead lost only reminds you to delete the event and tell the customer. New phone leads alert by email and Beeper. Bookings don't alert (the team invite is the record) unless the team invite or the Airtable save failed (`api/call.js`, `api/_calendar.js`).
- **Site** matches the Google profile: schema name "Scrappy Car - Junk Cars, Cars 4 Cash" (alternate "Scrappy Car"), open 24 hours, links to the profile and Instagram, city in the home H1, schema links to the Google listing, map shows the listing, address 125 Island Rd, M1C 2P7 everywhere (matches the Google profile), social card image, compressed truck photo, no em dashes. Submitted to Bing with IndexNow.

## Every pickup (Sean)

- [ ] Move the lead to **Picked up** when we have the car, then **Closed** once it's sold (Books goes by the lead's stage: Closed counts, Appointment Scheduled and Picked up show under Upcoming, anything else drops out). Fill in "Purchase Offer (CAD)" (paid to customer) and, if any, "Acquisition Costs (CAD)" at pickup, and "Revenue (CAD)" (sold to yard) at close, on its row in "Closed Leads P&L". Books reads these. A P&L row appears by itself for every booked lead (daily).
- [ ] When a lead is **Lost**, fill in "Lost Reason" (the call sheet does this for you).
- [ ] Add other expenses (gas, insurance, phone) on the Books page.
- [ ] Ask for a Google review with the profile's "Ask for reviews" link, and reply to new reviews.

## Needs a sign-in (one at a time, in Chrome)

- [ ] **Google Business Profile** stays as it is (Matt's rule: when the site and the profile disagree, change the site; editing the profile risks re-verification and trust). Still worth doing there without editing facts: reply to the new 5-star review and ask every pickup for a review. Two values on the profile look wrong, left alone for now: the address is 125 Island Rd while the yard is at 115 (the site shows 125 to match, Matt's call on Oct 28), and the website link is https://scrappycar.net/ (a redirect; https://scrappycar.ca/?utm_source=google&utm_medium=organic&utm_campaign=gbp would also make profile visits show as "gbp" in PostHog).
- [x] **Cloudflare Email Routing**: hello@scrappycar.ca forwards to Matt's Gmail (added Oct 28). Rules allow one destination each; forwarding to both of us would need an Email Worker. alerts@ is still dropped, on purpose.
- [x] **Google Search Console**: https://scrappycar.ca/ verified Oct 28 through the Google Analytics tag (keep that tag on the site), sitemap read successfully Oct 28 (6 pages).
- [x] **Bing Webmaster Tools**: imported from Search Console Oct 28; sitemap read successfully, 6 pages found and crawled. Check Search Performance and the AI Performance report there in a couple of weeks.
- [x] **Bing Places**: imported from the Google Business Profile Oct 28 (signed in with Google) and verified. "Pending publish", Bing says 7 to 12 days. It stays synced with Google, so edit the Google profile, never Bing. Check it shows on Bing Maps by about Nov 10.
- [ ] **Apple Business** (Apple Maps, Siri): on hold until there is a document to verify the business; see "Pick up here next".
- [ ] **Yelp, Facebook page, YellowPages.ca, 411.ca**: same name, address and phone everywhere. Then add the profile URLs to the schema `sameAs` on the site.
- [ ] **Google Ads second admin**: tag diagnostics asks for a second administrator so the account can't get locked out. Invite Sean (Admin > Access and security).
- [ ] **Google Ads**: the ad says "Up to $4000 for Your Junk Car", but offers and yard quotes top out around $1,500. Change it or Google may call it misleading. Also widen the location targeting; spend is well under budget.
- [ ] **Google Ads headline**: the ad has the maximum 15 headlines, one of them a broken "Junk Car Towing –". Replace it with "We Buy Cars Only. No Parts." so parts callers skip the ad (Ads > edit the ad > last headline > Save ad).
- [ ] **Google profile parts calls**: parts calls also come from the profile, which is listed as an auto wrecker (4 parts calls on Oct 29 against 3 ad clicks). Negative keywords can't stop those. Option, needs Matt's yes since it edits the profile: add "We buy cars for cash. We don't sell used parts." to the description.

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

## Experiments (interview stories)

Run real experiments that make good interview examples: a clear hypothesis, a metric that ties to money, a control, and an honest result, including "no effect" and "not enough data". Volume is a few leads a week, so prefer metrics that happen often (form steps, offer views), long runs, or holdouts, and write down the minimum effect each run can detect before starting. PostHog (feature flags and experiments, free tier) is already on every page; Google Ads has a built-in Experiments tool. Keep a short write-up per experiment in `marketing/experiments/`: hypothesis, design, dates, sample size, result, decision.

- [ ] **Follow-up email holdout**: hold back a random 20% of New leads with an offer from the day 1/5/21 emails and compare pickup rate within 28 days. Measures what the emails actually add, not just open rates (causal lift, not correlation).
- [ ] **Offer range wording**: the offer always shows a range (Matt's rule), so test how it's presented, e.g. "$300 to $450" against "$300, up to $450 with rims and cat". Metric: offer accepted rate.
- [ ] **Pricing model accuracy in production**: log the predicted yard price on every pickup next to what the yard actually paid. Track median error over time against the 99-quote backtest ($50 median error). An offline-to-online model evaluation story.
- [ ] **Form friction**: make the photo step skippable up front, or move it after the offer, and measure step 2 completion and quotes per form start. Split results by iOS and Android.
- [ ] **Ads bidding**: Google Ads campaign experiment, Maximize clicks against Maximize conversions (50/50 split), judged on cost per pickup from Books, not cost per click.
- [ ] **AI search visibility**: before and after the scrap price guide page goes live, ask a fixed set of about 8 questions ("best junk car removal in Scarborough") in Gemini with search, ChatGPT and Perplexity, and count how often Scrappy Car is named. Content change as the treatment, citation rate as the metric.
- [ ] **Speed to lead**: call back new quotes within 5 minutes against the usual delay (alternate by day), and compare pickup rate.

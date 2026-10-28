# Playbook: Outreach (Partners, Links, PR)

Three outreach motions, all run from the same Clay to Supabase to n8n pipeline:

1. **Referral partners**: businesses that send us cars (revenue)
2. **Link and listicle targets**: sites that link to or mention us (SEO and AI visibility)
3. **Local PR**: stories about two Scarborough guys running a local business (links, trust)

## 1. Pipeline

```
Clay table (source + enrich + score)
   └─► HTTP column posts row to n8n webhook  /webhook/clay-partner  or  /webhook/clay-link
          └─► n8n dedupes on domain/phone, upserts Supabase `partners` or `link_targets`
                 └─► n8n builds a daily outreach queue (status = 'queued', score desc)
                        ├─ phone / visit tasks → owner Telegram each morning (top 5)
                        └─ email → Claude drafts personalized first line → human approves → send
                               └─ replies land in Gmail → n8n Gmail trigger → status update
```

Sending: Gmail or Google Workspace on a separate outreach domain, max 30 new emails per day, warmed up over 2 weeks. Paid sequencers (Instantly, Smartlead) are not needed at this volume.

## 2. Referral partners

### Who

Score weights (Clay formula column):

- Independent mechanic / auto repair: 10
- Collision / body shop: 10
- Used car dealer, small lots: 8
- Tow company that does not buy cars: 8
- Property manager / condo management: 7
- Estate lawyer, estate sale company: 6
- Real estate agent (move-outs): 4
- Driving school, small fleet, rideshare fleet: 5

Distance multiplier: under 10 km from 115 Island Rd x1.5, 10 to 25 km x1.0, over 25 km x0.5.
Bonus: under 200 Google reviews (owner-operated, easier to reach) +2.

### Clay table recipe

1. **Source**: Google Maps search (Clay's Google Maps source or an Apify Google Maps scraper import) for each category x each area. Expect 400 to 800 businesses.
2. **Enrich**: website, phone, rating, review count, owner/manager name (website "about" page via Claygent, LinkedIn for larger ones), published business email.
3. **Qualify with Claygent**: "Does this business do repairs on older vehicles or hold unwanted vehicles? yes/no + reason."
4. **Score**: formula above.
5. **Export**: HTTP API column to n8n webhook, only rows with score 8+.

Keep credit use low: enrich email only for rows that pass qualification and score.

### Offer

- 50 CAD referral fee per completed pickup (paid by e-transfer, logged in `referral_payouts`)
- We pick up from their lot same day, their customer gets cash, they free up a bay
- Unique partner code or tracking number so every referral is attributed

### Sequence

1. Day 0: Marce or Ryan drops by or calls (local trades respond to people, not email). Leave a card with the partner code.
2. Day 1: email recap with the partner code and a one-page PDF.
3. Day 7: follow-up text or email.
4. Day 30: if no referrals, one check-in. Then stop.
5. After first referral: thank-you SMS plus payout confirmation. Monthly: "You sent us 3 cars this month" note.

## 3. Link and listicle targets

Target types (`link_targets.type`):

- `listicle`: "best junk car removal Toronto/Scarborough/Durham" pages (found by the AI visibility monitor's cited-URL data plus SERP pulls)
- `directory`: citation sites (see `local-seo.md`)
- `community`: Scarborough and Durham community sites, BIAs, local blogs, event pages
- `sponsorship`: local sports clubs, school fundraisers, community events (a 250 to 500 CAD sponsorship often includes a link and real goodwill)
- `resource`: pages like "what to do with an old car in Ontario", eco and recycling guides, city bulky item pages
- `partner`: referral partners who agree to list us on a "trusted partners" page

Workflow W16:

1. Weekly SERP pull (SerpApi free tier) for 30 queries; new domains upserted to `link_targets`.
2. Clay enriches site owner / editor contact.
3. Claude drafts a short, specific pitch using `prompts/outreach-pitch.md` (mentions their page, what we'd add, no fluff).
4. Human approves, sends. Replies tracked.
5. Monthly: check live links, record in `backlinks`.

## 4. Local PR

Angles that local outlets (Scarborough Mirror, Durham Region news, Toronto blogs, local podcasts) run:

- Two Scarborough guys started a scrap car business from a driveway
- How many cars end up abandoned in condo lots, and how to deal with them
- Environmental angle: what happens to a scrapped car (recycling percentages)
- Seasonal: "cars that won't survive another Ontario winter" (October/November), "spring cleanup"

Also: expert source platforms (Qwoted, Featured, Help a B2B Writer) for auto and money-saving stories. Low effort, free tiers.

## 5. Compliance

- CASL: B2B cold email allowed only to conspicuously published business addresses, relevant to their business, with no "no solicitation" note. Include sender identity, address, and working unsubscribe. Log in `consents` with `basis = 'conspicuous_publication'`.
- No scraping of personal profiles, no emailing personal addresses of consumers.
- Referral fees recorded; partners disclose if their customer asks.

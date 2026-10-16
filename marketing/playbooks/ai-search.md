# Playbook: AI Search Visibility (GEO / AEO)

Goal: when someone asks ChatGPT, Gemini, Google AI Overviews, Perplexity, Claude, Copilot, or Siri "who picks up scrap cars near me in Scarborough" or "best place to sell my junk car in Pickering", Scrappy Car is named, ideally first, with the right phone number.

## 1. How assistants pick local businesses

No assistant has a single public ranking formula, and they change often. What is consistent in practice:

- They search the web in real time, then summarize what the top sources agree on. Being on the pages they read matters more than anything on our own site.
- Sources they lean on for local services: Google Business Profile and reviews (Gemini, AI Overviews), Bing index and Bing Places (ChatGPT search, Copilot), Apple Business Connect and Yelp (Siri, Apple Maps), and the open web including Yelp, Reddit, "best of" listicles, and local directories (Perplexity, Claude, ChatGPT).
- They prefer businesses mentioned by several independent sources with consistent facts (same name, phone, area, services).
- They quote pages that answer the question directly in plain text (price ranges, "yes, free towing", "same day").
- Review text that names the service and area ("sold my 2009 Civic in West Rouge, same-day pickup") gets echoed back.

So the strategy is: **be consistently present on every source assistants read, and make our own pages the easiest to quote.**

## 2. Tactics

### 2.1 Entity consistency

- Same NAP everywhere (see `local-seo.md` citations list). Bing Places and Apple Business Connect are the two most often skipped and the two that matter most for ChatGPT and Siri.
- `Organization` / `AutoPartsStore` schema on the homepage with `sameAs` links to GBP, Bing, Apple, Yelp, Facebook, Instagram, TikTok, YouTube.
- Same short description everywhere: "Scrappy Car is a locally owned scrap car removal company in Scarborough, Ontario. Free towing, same-day pickup, and cash on the spot across Scarborough, Pickering, Ajax, and the east GTA."

### 2.2 Be in the listicles

Queries like "best junk car removal Toronto" return listicle pages ("Top 10 scrap car removal companies in Toronto"). Assistants summarize those.

- W16 finds them: Clay plus a SERP API pulls the top 20 results for 30 query variants, Clay enriches the author and site contact.
- Outreach asks to be considered, with a short fact sheet, review count, and a pickup video. Offer something useful (quote for their readers, photos). Never pay for placement without a disclosed sponsorship label.
- Track in `link_targets` with `type = 'listicle'`.

### 2.3 Answer-first content

On every key page, the first 2 sentences directly answer the question, then details:

- "How much will I get for my scrap car in Scarborough? Most cars get $200 to $1,500+. The exact number depends on weight, make, model, condition and the current steel price. Call (647) 204-4200 for a quote in under 2 minutes."
- Short, factual FAQ blocks with `FAQPage` schema.
- A plain-language `/scrap-car-value` page explaining the math (curb weight times price per tonne, condition adjustments). Pages that explain how a price is calculated get cited a lot.
- Keep facts current: price range, hours, areas. Stale facts get the business dropped or misquoted.

### 2.4 Reviews that say something

Review request SMS asks the customer to mention the car and neighbourhood. That text is what assistants quote.

### 2.5 Community mentions

Reddit threads (r/toronto, r/askTO, r/scarborough, r/durham) show up in AI answers constantly.

- Allowed: owners participating as themselves with disclosure ("I co-own a scrap car company, here's how pricing works"), answering questions genuinely, and customers who choose to mention us.
- Not allowed: fake accounts, paid posts without disclosure, vote manipulation. Reddit bans these and assistants are increasingly filtering them.

### 2.6 Crawler access and llms.txt

- `robots.txt` explicitly allows `OAI-SearchBot`, `ChatGPT-User`, `GPTBot`, `PerplexityBot`, `ClaudeBot`, `Claude-SearchBot`, `Google-Extended`, `Applebot`, `Applebot-Extended`, `Bingbot`.
- `/llms.txt` at the site root: a plain markdown summary of the business, services, areas, pricing guidance, hours, and key URLs. It's a lightweight convention; cheap to add, low effort to maintain. Created in repo root.
- IndexNow on deploy so Bing (and therefore ChatGPT search) picks up changes within hours.

### 2.7 Video

YouTube Shorts from the UGC pipeline with titles like "Junk car pickup in Pickering, 2011 Honda Civic" build a YouTube entity that Gemini and AI Overviews draw on.

## 3. Measurement: AI Visibility Monitor (W17)

A GTM system needs a number for this, so we measure it weekly instead of guessing.

Prompt set (stored in `ai_prompts`, around 40 prompts):

- Area x intent grid: {Scarborough, Pickering, Ajax, Markham, North York, East Toronto, Whitby, Oshawa} x {"scrap car removal near", "who buys junk cars in", "best place to sell my old car for scrap in", "same day junk car pickup"}
- Problem prompts: "my car failed emissions in Scarborough, what do I do", "how do I get rid of a car with no ownership in Ontario", "cash for cars near 401 and Meadowvale"

Weekly n8n run, for each prompt and each engine:

- **ChatGPT**: OpenAI Responses API with the `web_search` tool, location hint Toronto
- **Perplexity**: Sonar API
- **Gemini**: Gemini API with Google Search grounding
- **Claude**: Anthropic Messages API with the web search tool
- Optional: SerpApi for Google AI Overviews text

Store in `ai_visibility_checks`: engine, prompt, full answer, whether "Scrappy Car" is mentioned, position among businesses named, phone correct yes/no, competitors named, cited URLs.

A Claude parse step extracts the business list from each answer into JSON so position and competitors are structured.

Report in the Monday scorecard:

- Mention rate per engine (percent of prompts where we appear)
- Average position when mentioned
- Top cited domains (tells us exactly which listicles, directories, and threads to target next)
- Competitors who appear most (study their citations)

Cost: roughly 40 prompts x 4 engines x 4 weeks = 640 calls per month, a few dollars.

Answers vary run to run, so treat single results as noise and watch the 4-week trend.

## 4. Priority order

1. Bing Places + Apple Business Connect + Yelp claimed and consistent (week 1)
2. robots.txt, llms.txt, schema `sameAs` (week 1)
3. Review text engine live (weeks 2 to 3)
4. Monitor live for baseline (week 4)
5. Answer-first rewrites and `/scrap-car-value` page (weeks 4 to 6)
6. Listicle outreach driven by cited-domain data from the monitor (weeks 6+)

# Playbook: UGC Content Pipeline and Free Posting

Goal: 3 to 5 short videos per week published to TikTok, Instagram Reels, YouTube Shorts, Facebook Reels, and Google Business Profile, plus photos to GBP, at zero posting cost and under 10 minutes of human time per week.

Why it works for this business: every pickup is a story (old car, happy seller, cash, truck hauls it away). Real people and real cars in recognizable local places build trust faster than any ad, and the videos double as GBP photos, location page embeds, and YouTube signals for AI search.

## 1. Content sources

1. **Driver capture** (main source): Marce or Ryan films 3 clips per pickup on their phone, 5 to 15 seconds each:
   - The car as found ("2009 Civic, dead battery, sat 2 years")
   - The hookup / tow
   - The handshake or cash moment (only with seller consent, faces optional)
2. **Customer UGC**: after pickup, SMS asks "Want to be featured? Reply with a 10-second video about why you sold your car and get 20 CAD extra." Upload link goes to a Supabase Storage signed URL page.
3. **Owner talking heads**: 1 per week, answering a real question from calls ("Can I sell a car without ownership in Ontario?"). Claude pulls the top questions from `calls.summary` weekly and writes a 30-second script.
4. **Recurring formats**:
   - "What we paid" (car + price range, no customer info)
   - "Guess the year" (engagement)
   - "Weirdest thing found in a car"
   - "Myth vs fact" about scrap prices
   - Before/after lot cleanup for property managers (B2B proof)

## 2. Pipeline

```
Phone ──► Telegram bot "Scrappy Uploads" (free, no app store work)
            └─► n8n Telegram trigger (W13)
                  ├─ save original to Supabase Storage  ugc/raw/{date}/{id}.mp4
                  ├─ insert `media_assets` (pickup_id, area, consent_status='pending')
                  └─ if customer visible: SMS consent request (W13b), wait for YES

n8n (W14) processing, on the Mac mini:
  ffmpeg: normalize to 1080x1920, loudness -14 LUFS, trim dead air
  plate / face blur: open-source detector (for example a small YOLO plate model) → ffmpeg boxblur
  transcribe: Whisper (local whisper.cpp, free) → burned-in captions
  merge 3 clips → 15 to 30 second edit, add end card with phone number
  Claude (prompts/social-captions.md): hook line, caption per platform, hashtags, YouTube title
  save edit to  ugc/final/{id}.mp4, update `media_assets` status='ready'

Approval (W15):
  Telegram message to approver with the video + captions
  buttons: Approve / Edit caption / Reject
  approve → Postiz API schedules to all platforms at the next best slot
  writes one row per platform to `social_posts`

Metrics (W15b, daily):
  pull views, likes, shares, profile visits from Postiz analytics / platform APIs
  update `social_posts`, feed Monday scorecard
```

Longer raw footage (for example a 3-minute pickup) can go through the `clipify` or `cut-video` Claude skills on Matt's machine for cuts, then back into the same folder.

## 3. Free posting setup

**Postiz self-hosted** (open source, runs in Docker next to n8n). Connect:

- TikTok (business account)
- Instagram (professional account linked to the Facebook page)
- Facebook page
- YouTube channel (Shorts)
- Google Business Profile
- Optional: Threads, Pinterest, X, Nextdoor (Nextdoor business page posts manually, it's high-value locally)

n8n talks to Postiz through its public API. If Postiz is ever a problem, n8n can post directly via each platform's official API (YouTube Data API, Meta Graph API, TikTok Content Posting API after app review, GBP API). Buffer free (3 channels, 10 queued posts) is the no-hosting fallback.

Posting schedule (start here, adjust from data):

- TikTok and Reels: 5pm to 8pm weekdays, 10am weekends
- YouTube Shorts: same video, keyword-rich title "Junk car removal in {Area}: {Year Make Model}"
- GBP: 1 photo + 1 post per week minimum
- Every post: area name in caption, phone number on end card, link in bio with `utm_source={platform}&utm_medium=social`

## 4. Attribution

- Link in bio goes to `scrappycar.ca/?utm_source={platform}&utm_medium=social` (Postiz / n8n inserts per platform).
- Dedicated Twilio tracking number on the end card for social ("Text or call 647-XXX-XXXX") so calls from video viewers are counted.
- Ask on every call "How did you hear about us?" and log it (W04 SMS command accepts `SRC tiktok`).

## 5. Rules

- Written consent (SMS YES stored in `consents`) before any customer face, voice, house, or property appears.
- Blur license plates and house numbers every time, no exceptions. The pipeline blocks publishing if the blur step failed.
- No exact cash amounts tied to a recognizable customer. Price ranges only.
- Paid customer UGC: disclose "#ad" or "paid" where the platform requires, and honour the 20 CAD promptly.
- Use platform-licensed or royalty-free music only (TikTok and IG in-app commercial libraries, YouTube Audio Library).

## 6. Weekly human time budget

- Drivers: film 3 clips per pickup (1 minute each pickup)
- Approver: tap Approve on 3 to 5 videos (5 minutes)
- Owner: record one talking-head clip from the script (5 minutes)

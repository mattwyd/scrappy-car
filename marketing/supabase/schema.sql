-- Scrappy Car GTM engine: Supabase schema
-- Shared with CarCash (carca.sh). Every lead-level row carries `brand` so one
-- project, one n8n instance, and one scorecard serve both sites.
--
-- Access model: RLS is enabled on every table with no policies, so only the
-- service-role key (Vercel functions, n8n) can read or write. Never expose
-- the service key to the browser.
--
-- Apply: Supabase SQL editor, or `psql "$SUPABASE_DB_URL" -f schema.sql`.
-- Idempotent where practical; review before re-running on a live project.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Core funnel: lead → call/quote → pickup
-- ─────────────────────────────────────────────────────────────

create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  brand           text not null check (brand in ('scrappycar', 'carcash')),
  source          text not null check (source in ('form', 'call', 'sms', 'partner', 'walk_in', 'other')),
  status          text not null default 'new'
                  check (status in ('new', 'quoted', 'accepted', 'scheduled', 'picked_up', 'lost', 'spam')),

  -- contact
  name            text,
  email           text,
  phone_e164      text,
  city            text,
  postal_code     text,

  -- vehicle
  year            int,
  make            text,
  model           text,
  body_type       text check (body_type in ('car', 'truck')),
  is_running      boolean,
  km              int,
  rust            text,
  has_keys        boolean,
  has_ownership   boolean,
  notes           text,
  photos          text[],

  -- offer
  offer_cad       int,
  accepted_at     timestamptz,
  lost_reason     text,

  -- attribution (first touch, captured on landing)
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_term        text,
  utm_content     text,
  gclid           text,
  gbraid          text,
  wbraid          text,
  fbclid          text,
  referrer        text,
  landing_page    text,
  posthog_id      text,
  partner_code    text,
  channel         text,   -- derived: google_ads, gbp, organic, ai_assistant, social, partner, direct, other

  -- request metadata
  user_agent      text,
  ip              inet
);
create index if not exists leads_created_idx on leads (created_at desc);
create index if not exists leads_phone_idx   on leads (phone_e164);
create index if not exists leads_gclid_idx   on leads (gclid) where gclid is not null;

create table if not exists calls (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  brand             text not null check (brand in ('scrappycar', 'carcash')),
  twilio_call_sid   text unique,
  from_e164         text,
  to_number         text,            -- which tracking number was dialed
  number_channel    text,            -- channel that number belongs to (see tracking_numbers)
  answered_by       text,            -- e.g. 'marce', 'ryan', 'voicemail'
  answered          boolean,
  missed            boolean generated always as (not coalesce(answered, false)) stored,
  duration_sec      int,
  first_time_caller boolean,
  recording_url     text,            -- deleted after 90 days by W12
  transcript        text,
  summary           text,            -- Claude summary
  extracted         jsonb,           -- {year, make, model, running, area, quoted_price, objections}
  text_back_sent_at timestamptz,
  lead_id           uuid references leads (id),
  gclid             text             -- from DNI session match, when available
);
create index if not exists calls_created_idx on calls (created_at desc);
create index if not exists calls_from_idx    on calls (from_e164);

create table if not exists tracking_numbers (
  number_e164  text primary key,
  brand        text not null,
  channel      text not null,        -- main, google_ads, gbp, social, partner:<code>, print
  is_public    boolean not null default false,  -- true only for the NAP number
  notes        text
);

create table if not exists pickups (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  brand            text not null check (brand in ('scrappycar', 'carcash')),
  lead_id          uuid references leads (id),
  call_id          uuid references calls (id),
  completed_at     timestamptz not null default now(),
  area             text,
  year             int,
  make             text,
  model            text,
  paid_to_seller   int,
  revenue_est      int,              -- scrap + parts estimate
  tow_cost         int default 0,
  gross_margin     int generated always as (coalesce(revenue_est, 0) - coalesce(paid_to_seller, 0) - coalesce(tow_cost, 0)) stored,
  channel          text,
  partner_id       uuid,
  review_requested_at timestamptz,
  ads_uploaded_at  timestamptz,      -- W05 offline conversion
  raw_command      text              -- original "DONE ..." SMS for audit
);
create index if not exists pickups_completed_idx on pickups (completed_at desc);

create table if not exists scrap_prices (
  id            bigserial primary key,
  effective_on  date not null default current_date,
  brand         text not null,
  body_type     text not null check (body_type in ('car', 'truck')),
  is_running    boolean not null,
  offer_cad     int not null,
  unique (effective_on, brand, body_type, is_running)
);

create table if not exists consents (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  subject     text not null,         -- phone e164 or email
  kind        text not null check (kind in ('sms_marketing', 'email_marketing', 'ugc_likeness', 'call_recording')),
  basis       text not null check (basis in ('express', 'implied_inquiry', 'conspicuous_publication', 'revoked')),
  source      text,                  -- form url, call sid, sms reply id
  evidence    text
);
create index if not exists consents_subject_idx on consents (subject, kind, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Reviews and approvals
-- ─────────────────────────────────────────────────────────────

create table if not exists reviews (
  id             text primary key,   -- platform review id
  platform       text not null default 'google',
  brand          text not null,
  created_at     timestamptz,
  rating         int,
  author         text,
  body           text,
  reply_draft    text,
  reply_posted_at timestamptz,
  pickup_id      uuid references pickups (id)
);

create table if not exists approvals (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  kind          text not null,       -- review_reply, gbp_post, social_post, outreach_email, page_copy, ad_copy
  ref_table     text,
  ref_id        text,
  payload       jsonb not null,      -- the draft
  status        text not null default 'pending' check (status in ('pending', 'approved', 'edited', 'rejected', 'expired')),
  decided_by    text,
  decided_at    timestamptz
);
create index if not exists approvals_pending_idx on approvals (status, created_at) where status = 'pending';

-- ─────────────────────────────────────────────────────────────
-- Outreach: partners, link targets, citations
-- ─────────────────────────────────────────────────────────────

create table if not exists partners (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  brand          text not null default 'scrappycar',
  name           text not null,
  category       text,               -- mechanic, body_shop, used_lot, tow, property_mgr, estate, realtor, fleet
  domain         text,
  phone_e164     text,
  email          text,
  contact_name   text,
  address        text,
  distance_km    numeric,
  rating         numeric,
  review_count   int,
  score          numeric,
  clay_row_id    text,
  partner_code   text unique,
  status         text not null default 'queued'
                 check (status in ('queued', 'contacted', 'replied', 'active', 'declined', 'do_not_contact')),
  last_touch_at  timestamptz,
  next_touch_at  timestamptz,
  notes          text,
  unique (domain),
  unique (phone_e164)
);

create table if not exists referral_payouts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  partner_id  uuid not null references partners (id),
  pickup_id   uuid not null references pickups (id),
  amount_cad  int not null,
  paid_at     timestamptz,
  method      text default 'etransfer'
);

create table if not exists link_targets (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  type          text not null check (type in ('listicle', 'directory', 'community', 'sponsorship', 'resource', 'partner', 'press')),
  url           text not null unique,
  domain        text,
  query_found   text,
  contact_name  text,
  contact_email text,
  status        text not null default 'queued'
                check (status in ('queued', 'pitched', 'replied', 'won', 'lost', 'skip')),
  cited_by_ai   boolean default false,  -- set by W17 when an assistant cites this URL
  last_touch_at timestamptz,
  notes         text
);

create table if not exists backlinks (
  id            uuid primary key default gen_random_uuid(),
  found_at      timestamptz not null default now(),
  source_url    text not null,
  target_url    text not null,
  anchor        text,
  rel           text,
  live          boolean default true,
  last_checked  timestamptz,
  unique (source_url, target_url)
);

create table if not exists citations (
  id            uuid primary key default gen_random_uuid(),
  brand         text not null default 'scrappycar',
  site          text not null,       -- google, bing_places, apple, yelp, facebook, yellowpages, 411 ...
  url           text,
  status        text not null default 'todo' check (status in ('todo', 'submitted', 'live', 'mismatch')),
  nap_ok        boolean,
  last_checked  timestamptz,
  unique (brand, site)
);

-- ─────────────────────────────────────────────────────────────
-- Content: UGC media and social posts
-- ─────────────────────────────────────────────────────────────

create table if not exists media_assets (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  brand           text not null default 'scrappycar',
  kind            text not null check (kind in ('video', 'photo')),
  source          text not null check (source in ('driver', 'customer', 'owner', 'stock')),
  pickup_id       uuid references pickups (id),
  area            text,
  raw_path        text not null,     -- supabase storage path
  final_path      text,
  duration_sec    numeric,
  transcript      text,
  blur_ok         boolean,           -- publishing is blocked unless true
  consent_status  text not null default 'not_needed'
                  check (consent_status in ('not_needed', 'pending', 'granted', 'denied')),
  status          text not null default 'raw'
                  check (status in ('raw', 'processing', 'ready', 'approved', 'posted', 'rejected', 'failed')),
  captions        jsonb,             -- {tiktok, instagram, youtube_title, youtube_desc, facebook, gbp, hashtags}
  error           text
);

create table if not exists social_posts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  media_id         uuid references media_assets (id),
  platform         text not null,    -- tiktok, instagram, youtube, facebook, gbp, threads, nextdoor
  postiz_post_id   text,
  platform_post_id text,
  url              text,
  scheduled_for    timestamptz,
  published_at     timestamptz,
  caption          text,
  views            int,
  likes            int,
  comments         int,
  shares           int,
  profile_visits   int,
  link_clicks      int,
  metrics_updated_at timestamptz
);

-- ─────────────────────────────────────────────────────────────
-- Visibility: SEO, ranks, AI assistants
-- ─────────────────────────────────────────────────────────────

create table if not exists gsc_daily (
  day          date not null,
  page         text not null,
  query        text not null,
  clicks       int,
  impressions  int,
  ctr          numeric,
  position     numeric,
  primary key (day, page, query)
);

create table if not exists rank_checks (
  id          uuid primary key default gen_random_uuid(),
  checked_at  timestamptz not null default now(),
  keyword     text not null,
  location    text not null,         -- grid point label
  surface     text not null check (surface in ('maps', 'organic')),
  position    int,                   -- null = not found in results
  top_competitors jsonb
);

create table if not exists seo_tasks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  page        text,
  kind        text,                  -- title_rewrite, new_page, content_gap, fix
  suggestion  text,
  evidence    jsonb,
  status      text not null default 'open' check (status in ('open', 'done', 'skip'))
);

create table if not exists ai_prompts (
  id        serial primary key,
  prompt    text not null unique,
  area      text,
  intent    text,
  active    boolean not null default true
);

create table if not exists ai_visibility_checks (
  id               uuid primary key default gen_random_uuid(),
  checked_at       timestamptz not null default now(),
  run_id           text not null,    -- one id per weekly run
  engine           text not null check (engine in ('chatgpt', 'perplexity', 'gemini', 'claude', 'google_aio', 'copilot')),
  model            text,
  prompt_id        int references ai_prompts (id),
  answer           text,
  mentioned        boolean,
  position         int,              -- rank among businesses named, 1-based
  phone_correct    boolean,
  businesses       jsonb,            -- [{name, phone, url}]
  cited_urls       text[],
  error            text
);
create index if not exists aivis_run_idx on ai_visibility_checks (run_id, engine);

-- ─────────────────────────────────────────────────────────────
-- Spend
-- ─────────────────────────────────────────────────────────────

create table if not exists spend_daily (
  day        date not null,
  brand      text not null,
  channel    text not null,          -- google_ads, meta, sponsorship, referral_fees, ugc_rewards, tools
  campaign   text not null default '',
  cost_cad   numeric not null,
  clicks     int,
  impressions int,
  primary key (day, brand, channel, campaign)
);

-- ─────────────────────────────────────────────────────────────
-- Weekly scorecard (read by W10)
-- ─────────────────────────────────────────────────────────────

create or replace view weekly_scorecard as
with weeks as (
  select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as wk
),
b as (select unnest(array['scrappycar', 'carcash']) as brand)
select
  w.wk::date as week,
  b.brand,
  (select count(*) from calls c where c.brand = b.brand and date_trunc('week', c.created_at) = w.wk)                     as calls,
  (select count(*) from calls c where c.brand = b.brand and date_trunc('week', c.created_at) = w.wk and c.missed)       as missed_calls,
  (select count(*) from calls c where c.brand = b.brand and date_trunc('week', c.created_at) = w.wk and c.missed
                                    and c.text_back_sent_at is not null)                                             as missed_texted_back,
  (select count(*) from leads l where l.brand = b.brand and date_trunc('week', l.created_at) = w.wk and l.source = 'form') as form_leads,
  (select count(*) from leads l where l.brand = b.brand and date_trunc('week', l.accepted_at) = w.wk)                  as offers_accepted,
  (select count(*) from pickups p where p.brand = b.brand and date_trunc('week', p.completed_at) = w.wk)               as pickups,
  (select coalesce(sum(p.gross_margin), 0) from pickups p where p.brand = b.brand and date_trunc('week', p.completed_at) = w.wk) as gross_margin,
  (select coalesce(sum(s.cost_cad), 0) from spend_daily s where s.brand = b.brand and date_trunc('week', s.day) = w.wk) as spend,
  (select count(*) from reviews r where r.brand = b.brand and date_trunc('week', r.created_at) = w.wk)                 as new_reviews
from weeks w cross join b
order by week desc, brand;

create or replace view channel_cost_per_pickup as
with p as (
  select date_trunc('month', completed_at)::date as month, brand,
         coalesce(channel, 'unknown') as channel,
         count(*) as pickups, sum(gross_margin) as gross_margin
  from pickups group by 1, 2, 3
),
s as (
  select date_trunc('month', day)::date as month, brand, channel, sum(cost_cad) as spend
  from spend_daily group by 1, 2, 3
)
select
  coalesce(p.month, s.month)     as month,
  coalesce(p.brand, s.brand)     as brand,
  coalesce(p.channel, s.channel) as channel,
  coalesce(p.pickups, 0)         as pickups,
  coalesce(p.gross_margin, 0)    as gross_margin,
  coalesce(s.spend, 0)           as spend,
  case when coalesce(p.pickups, 0) > 0 then round(coalesce(s.spend, 0) / p.pickups, 2) end as cost_per_pickup
from p full join s using (month, brand, channel);

create or replace view ai_visibility_weekly as
select
  run_id,
  min(checked_at)::date as run_date,
  engine,
  count(*) filter (where error is null)                         as prompts,
  round(100.0 * avg((mentioned)::int) filter (where error is null), 1) as mention_rate_pct,
  round(avg(position) filter (where mentioned), 2)              as avg_position,
  round(100.0 * avg((phone_correct)::int) filter (where mentioned), 1) as phone_correct_pct
from ai_visibility_checks
group by run_id, engine;

-- ─────────────────────────────────────────────────────────────
-- Lock everything down (service role only)
-- ─────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'leads', 'calls', 'tracking_numbers', 'pickups', 'scrap_prices', 'consents', 'reviews', 'approvals',
    'partners', 'referral_payouts', 'link_targets', 'backlinks', 'citations', 'media_assets', 'social_posts',
    'gsc_daily', 'rank_checks', 'seo_tasks', 'ai_prompts', 'ai_visibility_checks', 'spend_daily'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Views run with the caller's rights so they don't bypass RLS.
alter view weekly_scorecard        set (security_invoker = on);
alter view channel_cost_per_pickup set (security_invoker = on);
alter view ai_visibility_weekly    set (security_invoker = on);

-- ─────────────────────────────────────────────────────────────
-- Seed data
-- ─────────────────────────────────────────────────────────────

-- Matches the current carca.sh ladder in api/_lib.js priceFor(). Scrappy Car
-- values are placeholders until Marce and Ryan confirm them.
insert into scrap_prices (brand, body_type, is_running, offer_cad) values
  ('carcash',    'car',   false, 100), ('carcash',    'car',   true, 200),
  ('carcash',    'truck', false, 300), ('carcash',    'truck', true, 400),
  ('scrappycar', 'car',   false, 200), ('scrappycar', 'car',   true, 300),
  ('scrappycar', 'truck', false, 350), ('scrappycar', 'truck', true, 450)
on conflict do nothing;

insert into citations (brand, site) values
  ('scrappycar', 'google'), ('scrappycar', 'bing_places'), ('scrappycar', 'apple_business_connect'),
  ('scrappycar', 'yelp'), ('scrappycar', 'facebook'), ('scrappycar', 'yellowpages_ca'),
  ('scrappycar', '411_ca'), ('scrappycar', 'foursquare'), ('scrappycar', 'waze'), ('scrappycar', 'bbb')
on conflict do nothing;

insert into ai_prompts (prompt, area, intent)
select format(t.tpl, a.area), a.area, t.intent
from (values
  ('Who does scrap car removal near %s, Ontario?',              'scrap_removal'),
  ('Where can I sell my junk car for cash in %s?',              'cash_for_cars'),
  ('Best company to pick up an old car that doesn''t run in %s', 'non_runner'),
  ('Same day junk car pickup in %s, who should I call?',        'same_day')
) as t(tpl, intent)
cross join (values
  ('Scarborough'), ('Pickering'), ('Ajax'), ('Whitby'), ('Oshawa'),
  ('Markham'), ('North York'), ('East Toronto'), ('West Rouge'), ('Port Union')
) as a(area)
on conflict do nothing;

insert into ai_prompts (prompt, area, intent) values
  ('My car failed emissions and isn''t worth fixing. I live in Scarborough. What should I do with it?', 'Scarborough', 'problem'),
  ('How do I get rid of a car with no ownership in Ontario? I''m in the east end of Toronto.',          'East Toronto', 'problem'),
  ('Is there a junk car buyer near Kingston Rd and Port Union Rd?',                                     'Port Union',   'hyperlocal')
on conflict do nothing;

// Shared helpers for the instant-offer API. Ported from carca.sh; the lead store
// is HubSpot (contact + deal) instead of Supabase.

// Best-effort per-IP throttle. Serverless instances are recycled so this is a
// speed bump against a script hammering the form, not a real rate limiter.
const HITS = new Map();

function throttled(req, limit, windowMs) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const recent = (HITS.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  HITS.set(ip, recent);
  if (HITS.size > 5000) HITS.clear();
  return recent.length > limit;
}

const TRUCK_WORDS = /\b(f-?\d{3}|silverado|sierra|ram|tacoma|tundra|ranger|colorado|canyon|frontier|titan|ridgeline|dakota|s-?10|sonoma|avalanche|escalade|suburban|tahoe|yukon|expedition|explorer|4runner|sequoia|highlander|pilot|pathfinder|armada|durango|traverse|acadia|equinox|rav4|cr-?v|crv|rogue|escape|edge|santa fe|tucson|sorento|sportage|forester|outback|cherokee|wrangler|gladiator|bronco|blazer|trailblazer|envoy|caravan|odyssey|sienna|transit|econoline|e-?\d{3}|savana|express|sprinter|promaster|van|suv|truck|pickup)\b/i;

function bodyTypeFor(model, declaredType) {
  if (declaredType === 'car' || declaredType === 'truck') return declaredType;
  return TRUCK_WORDS.test(model || '') ? 'truck' : 'car';
}

// The offer is a range, recomputed server-side on every quote so it can't be
// talked upward from the client.
//
// Low end: a flat ladder. Override without a code change by setting
// OFFER_PRICES to JSON like {"car":{"yes":300,"no":200},"truck":{"yes":450,"no":350}}.
// TODO(owners): confirm these numbers with Marce and Ryan before launch.
const DEFAULT_PRICES = { car: { yes: 300, no: 200 }, truck: { yes: 450, no: 350 } };

function ladderPrice(bodyType, isRunning) {
  let table = DEFAULT_PRICES;
  try { if (process.env.OFFER_PRICES) table = JSON.parse(process.env.OFFER_PRICES); } catch (e) {}
  return table[bodyType === 'truck' ? 'truck' : 'car'][isRunning ? 'yes' : 'no'];
}

// High end: fitted to 113 quotes from our yard (Sep 2024 to Oct 2026), it
// estimates what the yard pays for a pickup, then keeps a margin. Override any
// part without a code change by setting YARD_PRICES to JSON like
// {"margin":150,"base":{"suv":750}}.
const DEFAULT_YARD_PRICING = {
  // Yard's pickup price with alloy rims and the original catalytic converter.
  base: {
    small: 450, midsize: 550, compactSuv: 550, suv: 750, minivan: 700,
    smallPickup: 550, pickup: 800, van: 800,
  },
  newYear: 2015, newBonus: 100,
  oldYear: 2003, oldPenalty: 100,
  // Running barely changes a scrap price; it pays on newer vehicles the yard can part out.
  runningYear: 2013, runningBonus: 200,
  steelRims: 50,
  cat: { original: 0, aftermarket: 100, none: 200 },
  dropOff: 150, // owner brings it in, so no tow
  freeKm: 100, perKm: 6, // road km from the yard before towing eats into the price
  margin: 100,
  floor: 100,
  // The form doesn't ask about rims or the cat yet.
  assume: { rims: 'steel', cat: 'original' },
};

// Scrap value follows weight, so the classes are rough weight bands. Checked in
// order, first match wins; anything unmatched is an SUV if it's a truck body,
// otherwise a small car.
const CLASS_WORDS = [
  ['small', /\bmazda ?5\b/i], // compact MPV, priced like a small car
  ['minivan', /\b(caravan|town (and|&) country|odyssey|sienna|quest|sedona|carnival|pacifica|routan|uplander|montana|venture|windstar|freestar|entourage)\b/i],
  ['pickup', /\b(f-?[1-5]50|f-series|lariat|silverado|sierra|ram|tundra|titan|avalanche)\b/i],
  ['smallPickup', /\b(ranger|dakota|s-?10|sonoma|colorado|canyon|tacoma|frontier|ridgeline|gladiator|maverick|pickup)\b/i],
  ['van', /\b(econoline|e-?\d{3}|e-series|express|savana|transit|sprinter|promaster|nv\d{3,4}|van)\b/i],
  ['compactSuv', /\b(trax|juke|patriot|compass|vue|tribute|escape|forester|outback|rav4|cr-?v|crv|rogue|equinox|terrain|journey|kona|encore|tucson|sportage|cx-?[35]|xc\d{2}|venza)\b/i],
  ['suv', /\b(mkx|mkt|enclave|qx\d{2}|fx\d{2}|murano|sorento|santa fe|highlander|pilot|pathfinder|explorer|edge|cherokee|durango|traverse|acadia|4runner|tahoe|suburban|yukon|expedition|escalade|armada|sequoia)\b/i],
  ['midsize', /\b(accord|camry|mazda ?6|altima|maxima|fusion|taurus|sonata|optima|k5|malibu|impala|avenger|charger|200|300|sebring|grand prix|g6|lacrosse|regal|lucerne|crown victoria|grand marquis|passat|legacy|avalon|[57] series|5\d\di|g3[57]|xjs?|tlx?|s[68]0|cts|azera|cadenza|genesis)\b/i],
];

function vehicleClass(make, model, bodyType) {
  const name = `${make || ''} ${model || ''}`;
  const hit = CLASS_WORDS.find(([, words]) => words.test(name));
  if (hit) return hit[0];
  return bodyType === 'truck' ? 'suv' : 'small';
}

// Approximate road km from the yard (Mississauga) for towns past
// the service area. Every area the form suggests is within freeKm.
const FAR_KM = {
  barrie: 100, 'niagara falls': 110, woodstock: 130, orillia: 135, lindsay: 140, 'port hope': 140,
  peterborough: 145, collingwood: 150, cobourg: 150, london: 180, belleville: 210, sudbury: 390,
};

function kmFromYard(city) {
  const town = (city || '').split(',')[0].trim().toLowerCase().replace(/\s+(on|ontario)$/, '');
  return FAR_KM[town] || 0;
}

function yardPricing() {
  const d = DEFAULT_YARD_PRICING;
  try {
    const o = process.env.YARD_PRICES ? JSON.parse(process.env.YARD_PRICES) : null;
    if (o) {
      return {
        ...d, ...o,
        base: { ...d.base, ...o.base },
        cat: { ...d.cat, ...o.cat },
        assume: { ...d.assume, ...o.assume },
      };
    }
  } catch (e) {}
  return d;
}

// rims: 'alloy' | 'steel'; cat: 'original' | 'aftermarket' | 'none'. Unknown values
// fall back to yardPricing().assume. dropOff: the owner brings it to the yard.
function yardOffer({ year, make, model, bodyType, isRunning, rims, cat, dropOff, city }) {
  const p = yardPricing();
  let price = p.base[vehicleClass(make, model, bodyType)];
  if (year >= p.newYear) price += p.newBonus;
  if (year < p.oldYear) price -= p.oldPenalty;
  if (isRunning && year >= p.runningYear) price += p.runningBonus;
  if ((rims || p.assume.rims) === 'steel') price -= p.steelRims;
  price -= p.cat[cat] ?? p.cat[p.assume.cat];
  if (dropOff) price += p.dropOff;
  else price -= Math.max(0, kmFromYard(city) - p.freeKm) * p.perKm;
  price -= p.margin;
  return Math.max(p.floor, Math.floor(price / 10) * 10);
}

// The customer always sees a range: when the yard estimate is at or under the
// ladder, the top sits this far above the bottom.
const RANGE_MIN = 50;

// { low, high }
function priceFor(vehicle) {
  const low = ladderPrice(vehicle.bodyType, vehicle.isRunning);
  return { low, high: Math.max(low + RANGE_MIN, yardOffer(vehicle)) };
}

function offerText(low, high) {
  return Number(high) > Number(low) ? `$${low} to $${high}` : `$${low}`;
}

function clean(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

function digits(value, max) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  const s = clean(value, 20);
  if (!s) return null;
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

// North American numbers only (the service area is the GTA). Returns +1XXXXXXXXXX or null.
function toE164(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const d = String(value).replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  return null;
}

function readBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

// ── HubSpot ────────────────────────────────────────────────────────────────
// Needs HUBSPOT_TOKEN (private app / service key). The deal pipeline is found by
// label so no stage ids live in env vars; run scripts/hubspot-setup.mjs once.

const PIPELINE_LABEL = process.env.HUBSPOT_PIPELINE_LABEL || 'Scrappy Car';
const STAGE_LABELS = { offerSent: 'Offer sent', accepted: 'Offer accepted' };
let pipelineCache = null;

async function hubspot(path, options = {}) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error('HUBSPOT_TOKEN missing');
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`hubspot ${options.method || 'GET'} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

async function pipeline() {
  if (pipelineCache) return pipelineCache;
  const { results } = await hubspot('/crm/v3/pipelines/deals');
  const p = results.find((r) => r.label === PIPELINE_LABEL);
  if (!p) throw new Error(`deal pipeline "${PIPELINE_LABEL}" not found; run scripts/hubspot-setup.mjs`);
  const stage = (label) => {
    const s = p.stages.find((x) => x.label === label);
    if (!s) throw new Error(`stage "${label}" missing from pipeline "${PIPELINE_LABEL}"`);
    return s.id;
  };
  pipelineCache = { id: p.id, offerSent: stage(STAGE_LABELS.offerSent), accepted: stage(STAGE_LABELS.accepted) };
  return pipelineCache;
}

async function upsertContact({ email, name, phone, city }) {
  const properties = {};
  if (email) properties.email = email;
  if (name) properties.firstname = name;
  if (phone) properties.phone = phone;
  if (city) properties.city = city;
  if (email) {
    const { results } = await hubspot('/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties }] }),
    });
    return results[0].id;
  }
  // No email: phone isn't a unique key in HubSpot, so look it up before creating.
  const found = await hubspot('/crm/v3/objects/contacts/search', {
    method: 'POST',
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }] }], limit: 1 }),
  });
  if (found.results && found.results.length) {
    await hubspot(`/crm/v3/objects/contacts/${found.results[0].id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    return found.results[0].id;
  }
  const created = await hubspot('/crm/v3/objects/contacts', { method: 'POST', body: JSON.stringify({ properties }) });
  return created.id;
}

// Deal properties added after launch. HUBSPOT_TOKEN is a sensitive Vercel var
// that can't be read back to run scripts/hubspot-setup.mjs locally, so these
// are created on first use instead (needs the crm.schemas.deals.write scope).
const LATE_DEAL_PROPS = [
  { name: 'sc_referrer_host', label: 'Referring site (last touch)', type: 'string', fieldType: 'text', groupName: 'scrappy_car' },
  { name: 'sc_first_referrer_host', label: 'Referring site (first touch)', type: 'string', fieldType: 'text', groupName: 'scrappy_car' },
  // amount holds the low end of the offer range.
  { name: 'sc_offer_high', label: 'Offer range high', type: 'number', fieldType: 'number', groupName: 'scrappy_car' },
  // Written by api/followups.js and api/unsubscribe.js.
  { name: 'sc_followups_sent', label: 'Follow-up emails sent', type: 'number', fieldType: 'number', groupName: 'scrappy_car' },
  {
    name: 'sc_followups_stopped', label: 'Unsubscribed from follow-ups', type: 'bool', fieldType: 'booleancheckbox', groupName: 'scrappy_car',
    options: [{ label: 'Yes', value: 'true', displayOrder: 0 }, { label: 'No', value: 'false', displayOrder: 1 }],
  },
];

async function ensureLateDealProps() {
  for (const p of LATE_DEAL_PROPS) {
    try {
      await hubspot('/crm/v3/properties/deals', { method: 'POST', body: JSON.stringify(p) });
    } catch (err) {
      if (!/ 409:|already exists/i.test(String(err && err.message))) throw err;
    }
  }
}

async function createDeal(properties, contactId) {
  const p = await pipeline();
  const deal = await hubspot('/crm/v3/objects/deals', {
    method: 'POST',
    body: JSON.stringify({
      properties: { ...properties, pipeline: p.id, dealstage: p.offerSent },
      // 3 = HubSpot-defined deal → contact association.
      associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }] }],
    }),
  });
  return deal.id;
}

// Moves a deal from "Offer sent" to "Offer accepted". Returns the deal's
// properties when this call made the move, or null if it had already moved
// (a replayed accept must not fire a second notification).
async function acceptDeal(id) {
  const p = await pipeline();
  const deal = await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=dealname,amount,sc_offer_high,dealstage,description`);
  if (deal.properties.dealstage !== p.offerSent) return null;
  await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { dealstage: p.accepted } }),
  });
  return deal.properties;
}

// ── Beeper (Matrix) alerts, same room setup as carca.sh ───────────────────
// BEEPER_MATRIX_ROOM may list several rooms separated by commas, e.g. one chat
// per owner. Each room gets the alert; it counts as sent if any room got it.
async function notifyBeeper(lines) {
  const token = process.env.BEEPER_MATRIX_TOKEN;
  const rooms = (process.env.BEEPER_MATRIX_ROOM || '').split(',').map((r) => r.trim()).filter(Boolean);
  if (!token || !rooms.length) return { sent: false, reason: 'not configured' };

  const body = JSON.stringify({ msgtype: 'm.text', body: lines.filter((l) => l !== null).join('\n') });
  const results = await Promise.all(rooms.map(async (room) => {
    try {
      const res = await fetch(
        `https://matrix.beeper.com/_matrix/client/v3/rooms/${encodeURIComponent(room)}/send/m.room.message/${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body }
      );
      return res.ok ? null : `${room}: ${res.status} ${await res.text()}`;
    } catch (err) {
      return `${room}: ${err && err.message}`;
    }
  }));
  const failures = results.filter(Boolean);
  if (failures.length === rooms.length) return { sent: false, reason: failures.join('; ') };
  if (failures.length) console.error('beeper notify partly failed:', failures.join('; '));
  return { sent: true };
}

// ── Email from scrappycar.ca (Resend, set up through the Vercel integration) ──
// Customer email only ever goes out this way, never through the Gmail account,
// so the domain builds its own sending reputation.
function resendConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_DOMAIN);
}

function domainAddress(local) {
  return `${local}@${process.env.RESEND_EMAIL_DOMAIN}`;
}

// Throws on failure. A retry with the same idempotencyKey within 24 hours
// doesn't send a second copy.
async function sendEmail({ from, to, replyTo, subject, text, html, headers, tags, idempotencyKey }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from, to: [].concat(to), reply_to: replyTo ? [].concat(replyTo) : undefined, subject, text, html, headers,
      // Resend echoes tags back in webhook events (api/email-events.js).
      tags: tags ? Object.entries(tags).filter(([, v]) => v).map(([name, value]) => ({ name, value: String(value) })) : undefined,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend ${res.status}: ${body.message || body.name || 'error'}`);
  return body.id;
}

// ── PostHog (server-side events) ──────────────────────────────────────────
// Same project as track.js. The key is the public browser key, so it's fine in
// the repo. distinctId is the visitor's PostHog id when we have it, which puts
// email events on the same person as their visit to the site.
const POSTHOG_KEY = process.env.POSTHOG_KEY || 'phc_yRmsDYETa67YfsnAw3yg8zLsuoqrrBrGbRMehHjNNQcF';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

// Never throws: stats must not break sending or webhooks.
async function capture(event, distinctId, properties = {}) {
  try {
    const res = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY, event, distinct_id: distinctId,
        properties: { brand: 'scrappycar', source: 'server', ...properties },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error('posthog capture failed:', event, res.status);
  } catch (err) {
    console.error('posthog capture failed:', event, err && err.message);
  }
}

// ── Lead alerts ───────────────────────────────────────────────────────────
// Email to everyone in ALERT_EMAILS (comma separated), from the domain when
// Resend is set up, otherwise (or if that fails) from the Gmail account
// GMAIL_USER using GMAIL_APP_PASSWORD. Addresses live in env vars, not here,
// because this repo is public. Beeper is sent as well when it is configured,
// so the team receives both a durable email and an immediate alert.
let mailer = null;

function gmailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function emailConfigured() {
  return alertEmails().length > 0 && (resendConfigured() || gmailConfigured());
}

function gmail() {
  if (!mailer) {
    mailer = require('nodemailer').createTransport({
      service: 'gmail',
      // Google shows app passwords in groups of four; the spaces aren't part of it.
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    });
  }
  return mailer;
}

function alertEmails() {
  return (process.env.ALERT_EMAILS || '').split(',').map((a) => a.trim()).filter(Boolean);
}

async function notifyEmail(lines, { replyTo } = {}) {
  const text = lines.filter((l) => l !== null);
  const mail = { to: alertEmails(), replyTo: replyTo || undefined, subject: text[0], text: text.join('\n') };
  // Gmail marks mail from an account to itself as read, with no notification,
  // so the domain goes first.
  if (resendConfigured()) {
    try {
      await sendEmail({ ...mail, from: `Scrappy Car leads <${domainAddress('alerts')}>` });
      return { sent: true };
    } catch (err) {
      if (!gmailConfigured()) throw err;
      console.error('alert email via Resend failed, using Gmail:', err && err.message);
    }
  }
  await gmail().sendMail({ ...mail, from: `Scrappy Car leads <${process.env.GMAIL_USER}>` });
  return { sent: true };
}

async function notify(lines, options) {
  const failures = [];
  let sent = false;

  if (emailConfigured()) {
    try {
      await notifyEmail(lines, options);
      sent = true;
    } catch (err) {
      const reason = err && err.message;
      failures.push(`email: ${reason}`);
      console.error('email alert failed:', reason);
    }
  }

  const beeper = await notifyBeeper(lines);
  if (beeper.sent) sent = true;
  else if (beeper.reason) failures.push(`beeper: ${beeper.reason}`);

  return { sent, reason: failures.join('; ') || undefined };
}

module.exports = {
  bodyTypeFor, priceFor, offerText, clean, digits, toE164, readBody, throttled,
  hubspot, pipeline, upsertContact, createDeal, acceptDeal, notify, notifyBeeper,
  emailConfigured, resendConfigured, domainAddress, sendEmail, alertEmails, capture,
  LATE_DEAL_PROPS, ensureLateDealProps,
};

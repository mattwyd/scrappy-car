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

// Offer ladder, recomputed server-side on every quote so the number can't be
// talked upward from the client. Override without a code change by setting
// OFFER_PRICES to JSON like {"car":{"yes":300,"no":200},"truck":{"yes":450,"no":350}}.
// TODO(owners): confirm these numbers with Marce and Ryan before launch.
const DEFAULT_PRICES = { car: { yes: 300, no: 200 }, truck: { yes: 450, no: 350 } };

function priceFor(bodyType, isRunning) {
  let table = DEFAULT_PRICES;
  try { if (process.env.OFFER_PRICES) table = JSON.parse(process.env.OFFER_PRICES); } catch (e) {}
  return table[bodyType === 'truck' ? 'truck' : 'car'][isRunning ? 'yes' : 'no'];
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
  const [firstname, ...rest] = (name || '').split(/\s+/);
  const properties = {};
  if (email) properties.email = email;
  if (firstname) properties.firstname = firstname;
  if (rest.length) properties.lastname = rest.join(' ');
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
  const deal = await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(id)}?properties=dealname,amount,dealstage,description`);
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

// ── Lead alerts ───────────────────────────────────────────────────────────
// Email to everyone in ALERT_EMAILS (comma separated), sent from the Gmail
// account GMAIL_USER using GMAIL_APP_PASSWORD. Addresses live in env vars, not
// here, because this repo is public. Until email is set up, or if a send
// fails, alerts go to Beeper instead.
let mailer = null;

function emailConfigured() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.ALERT_EMAILS);
}

async function notifyEmail(lines, { replyTo } = {}) {
  const to = process.env.ALERT_EMAILS.split(',').map((a) => a.trim()).filter(Boolean);
  if (!mailer) {
    mailer = require('nodemailer').createTransport({
      service: 'gmail',
      // Google shows app passwords in groups of four; the spaces aren't part of it.
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, '') },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    });
  }
  const text = lines.filter((l) => l !== null);
  await mailer.sendMail({
    from: `Scrappy Car leads <${process.env.GMAIL_USER}>`,
    to,
    replyTo: replyTo || undefined,
    subject: text[0],
    text: text.join('\n'),
  });
  return { sent: true };
}

async function notify(lines, options) {
  if (emailConfigured()) {
    try {
      return await notifyEmail(lines, options);
    } catch (err) {
      console.error('email alert failed, falling back to beeper:', err && err.message);
    }
  }
  return notifyBeeper(lines);
}

module.exports = {
  bodyTypeFor, priceFor, clean, digits, toE164, readBody, throttled,
  upsertContact, createDeal, acceptDeal, notify, notifyBeeper,
  LATE_DEAL_PROPS, ensureLateDealProps,
};

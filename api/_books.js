// The books: expenses and ad spend, and the monthly P&L worked out from them
// plus Airtable's closed-lead P&L rows. Used by api/books.js (the Books page and the
// Google Ads script) and api/books-daily.js (monthly email, missing prices).
//
// Entries live in Vercel Blob. Blob URLs are public, so everything sits under
// a folder name derived from CRON_SECRET that nobody can guess.
const crypto = require('crypto');
const { list, put, del } = require('@vercel/blob');
const { airtable, listAirtableLeads, listAirtableRecords, AIRTABLE_LEAD_FIELDS, AIRTABLE_LEADS_TABLE_ID, leadUrl } = require('./_lib');

const CATEGORIES = ['Gas', 'Tow', 'Google Ads', 'Other ads', 'Insurance', 'Phone', 'Tools and parts', 'Other'];
const ADS_CHANNEL = 'google_ads';
const AIRTABLE_PNL_TABLE_ID = process.env.AIRTABLE_PNL_TABLE_ID || 'tblzSIcvrLREfzVNX';

function derive(purpose) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET).update(purpose).digest('base64url').slice(0, 32);
}

function booksKey() {
  return derive('books');
}

function keyOk(k) {
  if (!process.env.CRON_SECRET || typeof k !== 'string') return false;
  const want = Buffer.from(booksKey());
  const got = Buffer.from(k);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const folder = () => `books-${derive('books-store').slice(0, 20)}/`;

function torontoDate(t) {
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD
}

function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.cursor;
  } while (cursor);
  return out;
}

async function readJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  return r.ok ? r.json() : null;
}

const putJson = (path, data) => put(path, JSON.stringify(data), {
  access: 'public', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60,
});

// ── Expenses: one blob each, so two people adding at once can't clash ──
async function addExpense({ date, category, amount, note }) {
  const e = { date, category, amount: money(amount), note: String(note || '').slice(0, 200), at: new Date().toISOString() };
  const b = await putJson(`${folder()}exp/${date.slice(0, 7)}/${date}-${crypto.randomBytes(6).toString('hex')}.json`, e);
  return { ...e, id: b.url };
}

async function expenses(month) {
  const blobs = await listAll(`${folder()}exp/${month}/`);
  const rows = await Promise.all(blobs.map(async (b) => ({ ...(await readJson(b.url)), id: b.url })));
  return rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
}

async function removeExpense(id) {
  if (typeof id !== 'string' || !id.includes(`/${folder()}exp/`)) throw new Error('not an expense');
  await del(id);
}

// ── Ad spend from the Google Ads script: one blob per day, replaced when resent ──
async function setAdSpend(days) {
  let saved = 0;
  for (const { date, cost } of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !Number.isFinite(Number(cost))) continue;
    const old = await listAll(`${folder()}ads/${date}`);
    await putJson(`${folder()}ads/${date}-${crypto.randomBytes(4).toString('hex')}.json`, { date, cost: money(cost) });
    if (old.length) await del(old.map((b) => b.url));
    saved++;
  }
  return saved;
}

async function adSpendDays(month) {
  const blobs = await listAll(`${folder()}ads/${month}`);
  const newest = {};
  blobs.forEach((b) => {
    const d = b.pathname.split('/ads/')[1].slice(0, 10);
    if (!newest[d] || new Date(b.uploadedAt) > new Date(newest[d].uploadedAt)) newest[d] = b;
  });
  return (await Promise.all(Object.values(newest).map((b) => readJson(b.url)))).filter(Boolean);
}

// ── Airtable closed-lead P&L ──
// A P&L row holds the money for one deal; its lead says where the deal stands.
// Each deal is judged by the lead's current (most final) stage: Lost drops out,
// "Picked up" (or a sale price entered) counts in the month it was picked up,
// and anything accepted or booked waits under "upcoming". Rows match their lead
// by name (Closed Lead is a copy of the lead's Lead field).
const PNL = {
  lead: 'Closed Lead', stage: 'Closed Stage', purchase: 'Purchase Offer (CAD)', acquisition: 'Acquisition Costs (CAD)',
  revenue: 'Revenue (CAD)', status: 'P&L Status', notes: 'Notes',
};
const L = AIRTABLE_LEAD_FIELDS;
const CLOSING = ['Offer accepted', 'Appointment Scheduled', 'Picked up'];

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const has = (value) => value != null && value !== '';
// Channel as the site names them (google_ads, gbp, organic...). Leads from
// before channels were saved fall back to how they came in.
const channelOf = (f) => f[L.channel] || { 'Phone call': 'phone', Imported: 'imported' }[f[L.source]] || 'unknown';
const rowUrl = (id) => leadUrl(id).replace(AIRTABLE_LEADS_TABLE_ID, AIRTABLE_PNL_TABLE_ID);

async function closedRecords() {
  return listAirtableRecords(AIRTABLE_PNL_TABLE_ID);
}

// Every lead at "Offer accepted" or later gets a P&L row (the Airtable
// automation only adds one when a lead passes through "Offer accepted", so
// imported or hand-moved leads can miss it), and each row's Closed Stage
// follows its lead. Returns what changed.
async function reconcile() {
  const [rows, leads] = await Promise.all([closedRecords(), listAirtableLeads()]);
  const byName = new Map(rows.map((r) => [String(r.fields[PNL.lead] || ''), r]));
  const created = [];
  const updated = [];
  for (const lead of leads) {
    const f = lead.fields || {};
    const name = String(f[L.lead] || '');
    const stage = f[L.stage];
    const row = byName.get(name);
    if (!name || /\btest\b/i.test(name)) continue;
    if (!row && CLOSING.includes(stage)) {
      await airtable(`/${AIRTABLE_PNL_TABLE_ID}`, { method: 'POST', body: JSON.stringify({ typecast: true, fields: {
        [PNL.lead]: name, [PNL.stage]: stage, [PNL.status]: 'Awaiting revenue',
        ...(has(f[L.offer]) ? { [PNL.purchase]: Number(f[L.offer]) } : {}),
      } }) });
      created.push(name);
    } else if (row && stage && row.fields[PNL.stage] !== stage) {
      await airtable(`/${AIRTABLE_PNL_TABLE_ID}/${row.id}`, { method: 'PATCH', body: JSON.stringify({ typecast: true, fields: { [PNL.stage]: stage } }) });
      updated.push(`${name}: ${stage}`);
    }
  }
  return { created, updated };
}

// One entry per deal: P&L rows joined to their lead, plus accepted, booked or
// picked-up leads that have no row yet (reconcile adds one at the next run).
function deals(rows, leads) {
  const byName = new Map(leads.map((l) => [String((l.fields || {})[L.lead] || ''), l]));
  const out = rows.map((r) => {
    const q = r.fields;
    const lead = byName.get(String(q[PNL.lead] || ''));
    const f = (lead && lead.fields) || {};
    byName.delete(String(q[PNL.lead] || ''));
    return {
      id: r.id, url: rowUrl(r.id), name: q[PNL.lead] || r.id, stage: f[L.stage] || q[PNL.stage] || '',
      date: f[L.pickupDate] || torontoDate(r.createdTime), channel: channelOf(f),
      revenue: q[PNL.revenue], purchase: has(q[PNL.purchase]) ? q[PNL.purchase] : f[L.offer], acquisition: q[PNL.acquisition], hasRow: true,
    };
  });
  byName.forEach((lead, name) => {
    const f = lead.fields || {};
    if (!CLOSING.includes(f[L.stage]) || !name || /\btest\b/i.test(name)) return;
    out.push({
      id: lead.id, url: leadUrl(lead.id), name, stage: f[L.stage], date: f[L.pickupDate] || torontoDate(lead.createdTime), channel: channelOf(f),
      revenue: null, purchase: f[L.offer], acquisition: null, hasRow: false,
    });
  });
  return out.map((d) => ({
    ...d,
    counted: d.stage !== 'Lost' && (d.stage === 'Picked up' || has(d.revenue)),
    upcoming: d.stage !== 'Lost' && d.stage !== 'Picked up' && !has(d.revenue),
  }));
}

// What needs a hand in Airtable: picked-up deals without both prices, and
// bookings whose pickup day has passed but aren't marked "Picked up".
function dealIssues(all, today = torontoDate(Date.now())) {
  const missing = all
    .filter((d) => d.counted && (!has(d.revenue) || !has(d.purchase)))
    .map((d) => ({
      id: d.id, url: d.url, name: d.name, date: d.date,
      missing: d.hasRow ? [!has(d.revenue) && PNL.revenue, !has(d.purchase) && PNL.purchase].filter(Boolean) : ['a Closed Leads P&L row'],
    }));
  const overdue = all
    .filter((d) => d.upcoming && d.stage === 'Appointment Scheduled' && d.date < today)
    .map((d) => ({ id: d.id, url: d.url, name: d.name, date: d.date, missing: ['its lead moved to "Picked up" (or "Lost"): pickup day has passed'] }));
  return [...missing, ...overdue];
}

async function issues() {
  const [rows, leads] = await Promise.all([closedRecords(), listAirtableLeads()]);
  return dealIssues(deals(rows, leads));
}

async function pnl(month) {
  const [closed, created, exp, ads] = await Promise.all([closedRecords(), listAirtableLeads(), expenses(month), adSpendDays(month)]);
  const all = deals(closed, created);

  const pickups = all
    .filter((d) => d.counted && d.date.startsWith(month))
    .map((d) => {
      const sold = money(number(d.revenue));
      const paid = money(number(d.purchase));
      const job = money(number(d.acquisition));
      return {
        id: d.id, url: d.url, name: d.name, date: d.date, channel: d.channel,
        sold, paid, job, profit: money(sold - paid - job), complete: has(d.revenue) && has(d.purchase),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = all
    .filter((d) => d.upcoming)
    .map((d) => ({ id: d.id, url: d.url, name: d.name, stage: d.stage, date: d.date, paid: money(number(d.purchase)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const leads = created.filter((r) => torontoDate(r.createdTime).startsWith(month) && !/\btest\b/i.test(String(r.fields[L.lead] || '')));
  const lost = {};
  leads.forEach((r) => { if (r.fields[L.stage] === 'Lost') { const k = r.fields[L.lostReason] || 'no reason'; lost[k] = (lost[k] || 0) + 1; } });

  // Google Ads spend: the script's daily numbers when there are any, else
  // whatever was entered by hand under "Google Ads". Never both.
  const scriptAds = money(ads.reduce((s, a) => s + Number(a.cost || 0), 0));
  const manualAds = money(exp.filter((e) => e.category === 'Google Ads').reduce((s, e) => s + e.amount, 0));
  const adSpend = ads.length ? scriptAds : manualAds;
  const other = exp.filter((e) => e.category !== 'Google Ads');
  const byCategory = {};
  other.forEach((e) => { byCategory[e.category] = money((byCategory[e.category] || 0) + e.amount); });

  const sum = (rows, k) => money(rows.reduce((s, r) => s + r[k], 0));
  const revenue = sum(pickups, 'sold');
  const carCost = sum(pickups, 'paid');
  const jobCosts = sum(pickups, 'job');
  const grossProfit = money(revenue - carCost - jobCosts);
  const otherExpenses = sum(other, 'amount');

  const channels = {};
  leads.forEach((r) => { const c = channelOf(r.fields); (channels[c] = channels[c] || { leads: 0, pickups: 0, profit: 0 }).leads++; });
  pickups.forEach((r) => { const c = (channels[r.channel] = channels[r.channel] || { leads: 0, pickups: 0, profit: 0 }); c.pickups++; c.profit = money(c.profit + r.profit); });
  if (channels[ADS_CHANNEL] || adSpend) {
    const c = (channels[ADS_CHANNEL] = channels[ADS_CHANNEL] || { leads: 0, pickups: 0, profit: 0 });
    c.adSpend = adSpend;
    c.profitAfterAds = money(c.profit - adSpend);
    c.costPerLead = c.leads ? money(adSpend / c.leads) : null;
    c.costPerPickup = c.pickups ? money(adSpend / c.pickups) : null;
  }

  return {
    month, revenue, carCost, jobCosts, grossProfit, adSpend, adSpendSource: ads.length ? 'google_ads_script' : 'entered',
    otherExpenses, byCategory, netProfit: money(grossProfit - adSpend - otherExpenses),
    leads: leads.length, pickupCount: pickups.length, pickups, channels, lostReasons: lost,
    incomplete: pickups.filter((r) => !r.complete).length, missing: dealIssues(all), upcoming, expenses: exp,
  };
}

const $ = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Plain-text P&L for the monthly email and Beeper.
function reportLines(r, link) {
  const label = new Date(`${r.month}-15T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const lines = [
    `📊 Scrappy Car P&L, ${label}: ${$(r.netProfit)} net`,
    '',
    `Pickups: ${r.pickupCount} from ${r.leads} leads`,
    `Sold to yards: ${$(r.revenue)}`,
    `Paid to customers: ${$(r.carCost)}`,
    `Job costs: ${$(r.jobCosts)}`,
    `Gross profit: ${$(r.grossProfit)}`,
    `Google Ads: ${$(r.adSpend)}${r.adSpendSource === 'entered' ? ' (entered by hand)' : ''}`,
    ...Object.entries(r.byCategory).map(([c, v]) => `${c}: ${$(v)}`),
    `Net profit: ${$(r.netProfit)}`,
    '',
    'By channel (leads / pickups / profit):',
    ...Object.entries(r.channels).map(([c, v]) => `${c}: ${v.leads} / ${v.pickups} / ${$(v.profit)}${v.adSpend != null ? `, ${$(v.profitAfterAds)} after ads${v.costPerPickup != null ? `, ${$(v.costPerPickup)} per pickup` : ''}` : ''}`),
  ];
  if (Object.keys(r.lostReasons).length) lines.push('', 'Lost: ' + Object.entries(r.lostReasons).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', '));
  if (r.incomplete) lines.push('', `⚠️ ${r.incomplete} pickup(s) this month have no prices yet, so the numbers are low.`);
  if (link) lines.push('', `Books: ${link}`);
  return lines;
}

module.exports = {
  CATEGORIES, booksKey, keyOk, torontoDate, previousMonth, money,
  addExpense, expenses, removeExpense, setAdSpend, adSpendDays, closedRecords, reconcile, issues, pnl, reportLines,
};

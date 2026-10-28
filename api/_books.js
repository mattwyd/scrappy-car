// The books: expenses and ad spend, and the monthly P&L worked out from them
// plus HubSpot's picked-up deals. Used by api/books.js (the Books page and the
// Google Ads script) and api/books-daily.js (monthly email, missing prices).
//
// Entries live in Vercel Blob. Blob URLs are public, so everything sits under
// a folder name derived from CRON_SECRET that nobody can guess.
const crypto = require('crypto');
const { list, put, del } = require('@vercel/blob');
const { hubspot, pipeline } = require('./_lib');

const CATEGORIES = ['Gas', 'Tow', 'Google Ads', 'Other ads', 'Insurance', 'Phone', 'Tools and parts', 'Other'];
const ADS_CHANNEL = 'google_ads';
const PORTAL = () => process.env.HUBSPOT_PORTAL_ID;

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

// ── HubSpot deals ──
const DEAL_PROPS = [
  'dealname', 'dealstage', 'createdate', 'closedate', 'amount', 'sc_channel', 'sc_lost_reason',
  'sc_sold_for', 'sc_paid_customer', 'sc_job_costs', 'sc_pickup_date',
];

async function searchDeals(filters) {
  const out = [];
  let after;
  do {
    const r = await hubspot('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify({ filterGroups: [{ filters }], properties: DEAL_PROPS, limit: 100, after }),
    });
    out.push(...r.results);
    after = r.paging && r.paging.next && r.paging.next.after;
  } while (after);
  return out;
}

// A date-only HubSpot property comes back as a date or as midnight UTC.
const pickupDay = (p) => (p.sc_pickup_date ? String(p.sc_pickup_date).slice(0, 10) : p.closedate ? torontoDate(p.closedate) : null);
const isTest = (p) => p.sc_lost_reason === 'test_or_duplicate';
const dealUrl = (id) => (PORTAL() ? `https://app.hubspot.com/contacts/${PORTAL()}/record/0-3/${id}` : null);

// Picked-up deals still missing the numbers the P&L needs, any month.
function missingPrices(picked) {
  return picked
    .filter((d) => d.properties.sc_sold_for == null || d.properties.sc_paid_customer == null)
    .map((d) => ({
      id: d.id, name: d.properties.dealname, url: dealUrl(d.id), date: pickupDay(d.properties),
      missing: ['sc_sold_for', 'sc_paid_customer'].filter((k) => d.properties[k] == null)
        .map((k) => (k === 'sc_sold_for' ? 'Sold to yard for' : 'Paid to customer')),
    }));
}

async function pnl(month) {
  const p = await pipeline();
  const [y, m] = month.split('-').map(Number);
  // Leads created in the month; a day either side, then trimmed to Toronto dates.
  const from = Date.UTC(y, m - 1, 1) - 864e5;
  const to = Date.UTC(y, m, 1) + 864e5;
  const [picked, created, exp, ads] = await Promise.all([
    searchDeals([{ propertyName: 'pipeline', operator: 'EQ', value: p.id }, { propertyName: 'dealstage', operator: 'EQ', value: p.pickedUp }]),
    searchDeals([
      { propertyName: 'pipeline', operator: 'EQ', value: p.id },
      { propertyName: 'createdate', operator: 'GTE', value: String(from) },
      { propertyName: 'createdate', operator: 'LT', value: String(to) },
    ]),
    expenses(month),
    adSpendDays(month),
  ]);

  const pickups = picked
    .filter((d) => (pickupDay(d.properties) || '').startsWith(month))
    .map((d) => {
      const q = d.properties;
      const sold = money(q.sc_sold_for);
      const paid = money(q.sc_paid_customer);
      const job = money(q.sc_job_costs);
      return {
        id: d.id, name: q.dealname, url: dealUrl(d.id), date: pickupDay(q), channel: q.sc_channel || 'unknown',
        sold, paid, job, profit: money(sold - paid - job), complete: q.sc_sold_for != null && q.sc_paid_customer != null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const leads = created.filter((d) => torontoDate(d.properties.createdate).startsWith(month) && !isTest(d.properties));
  const lost = {};
  leads.filter((d) => d.properties.dealstage === p.lost).forEach((d) => {
    const r = d.properties.sc_lost_reason || 'no reason given';
    lost[r] = (lost[r] || 0) + 1;
  });

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
  leads.forEach((d) => { const c = d.properties.sc_channel || 'unknown'; (channels[c] = channels[c] || { leads: 0, pickups: 0, profit: 0 }).leads++; });
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
    incomplete: pickups.filter((r) => !r.complete).length, missing: missingPrices(picked), expenses: exp,
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
  addExpense, expenses, removeExpense, setAdSpend, adSpendDays, searchDeals, missingPrices, pnl, reportLines,
};

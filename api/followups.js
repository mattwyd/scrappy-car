const {
  hubspot, pipeline, ensureLateDealProps, resendConfigured, domainAddress, sendEmail, alertEmails, notify,
} = require('./_lib');
const { MAX_DAYS, SCHEDULE, daysSince, dueStep, unsubscribeUrl, renderEmail } = require('./_followups');

// Daily cron (vercel.json): emails people whose deal is still at "Offer sent"
// on day 1, 5 and 21 after their offer. Anything that moves the deal on
// (accepted, booked, lost) or the unsubscribe link stops the emails.
//
// Sent from the domain through Resend, never the Gmail account. Nothing is sent
// unless FOLLOWUPS_LIVE=1 and Resend is set up. Otherwise, and with ?dry=1, it
// only returns who would get which email.

const DEAL_PROPS = [
  'dealname', 'amount', 'sc_offer_high', 'createdate', 'dealstage',
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'sc_followups_sent', 'sc_followups_stopped',
];

async function openDeals() {
  const p = await pipeline();
  const since = Date.now() - (MAX_DAYS + 1) * 864e5;
  const { results } = await hubspot('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: p.id },
          { propertyName: 'dealstage', operator: 'EQ', value: p.offerSent },
          { propertyName: 'createdate', operator: 'GTE', value: String(since) },
        ],
      }],
      properties: DEAL_PROPS,
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 100,
    }),
  });
  return results;
}

// deal id -> contact { id, email, firstname }
async function contactsFor(deals) {
  if (!deals.length) return {};
  const assoc = await hubspot('/crm/v4/associations/deals/contacts/batch/read', {
    method: 'POST',
    body: JSON.stringify({ inputs: deals.map((d) => ({ id: d.id })) }),
  });
  const contactOf = {};
  (assoc.results || []).forEach((r) => { if (r.to && r.to[0]) contactOf[r.from.id] = String(r.to[0].toObjectId); });
  const ids = [...new Set(Object.values(contactOf))];
  if (!ids.length) return {};
  const contacts = await hubspot('/crm/v3/objects/contacts/batch/read', {
    method: 'POST',
    body: JSON.stringify({ properties: ['email', 'firstname'], inputs: ids.map((id) => ({ id })) }),
  });
  const byId = {};
  (contacts.results || []).forEach((c) => { byId[c.id] = { id: c.id, ...c.properties }; });
  const out = {};
  Object.entries(contactOf).forEach(([dealId, contactId]) => { if (byId[contactId]) out[dealId] = byId[contactId]; });
  return out;
}

// One email per person per day at most: only their newest open deal counts,
// and an unsubscribe on any of their open deals stops all of them.
function plan(deals, contacts, now) {
  const own = new Set([process.env.GMAIL_USER, ...alertEmails()].filter(Boolean).map((a) => a.toLowerCase()));
  const ownDomain = (process.env.RESEND_EMAIL_DOMAIN || '').toLowerCase();
  const byContact = new Map();
  deals.forEach((d) => {
    const c = contacts[d.id];
    if (!c) return;
    if (!byContact.has(c.id)) byContact.set(c.id, { contact: c, deals: [] });
    byContact.get(c.id).deals.push(d);
  });

  const due = [];
  const skipped = [];
  byContact.forEach(({ contact, deals: theirs }) => {
    const deal = theirs.reduce((a, b) => (Date.parse(b.properties.createdate) > Date.parse(a.properties.createdate) ? b : a));
    const p = deal.properties;
    const who = `${contact.firstname || '?'} (deal ${deal.id})`;
    const email = (contact.email || '').trim();
    if (!email) return skipped.push(`${who}: no email`);
    if (own.has(email.toLowerCase()) || (ownDomain && email.toLowerCase().endsWith(`@${ownDomain}`))) return skipped.push(`${who}: our own address`);
    if (/\btest\b/i.test(`${contact.firstname} ${p.dealname}`)) return skipped.push(`${who}: test lead`);
    if (theirs.some((d) => d.properties.sc_followups_stopped === 'true')) return skipped.push(`${who}: unsubscribed`);
    const days = daysSince(p.createdate, now);
    const sent = Number(p.sc_followups_sent) || 0;
    const step = dueStep(days, sent);
    if (!step) return skipped.push(`${who}: day ${days}, ${sent} sent, nothing due`);
    due.push({ deal, contact, email, step, days, sent });
  });
  return { due, skipped };
}

async function setSent(dealId, n) {
  await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { sc_followups_sent: String(n) } }),
  });
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.HUBSPOT_TOKEN) return res.status(200).json({ skipped: 'HUBSPOT_TOKEN missing' });
  const live = process.env.FOLLOWUPS_LIVE === '1' && !(req.query && req.query.dry === '1') && resendConfigured();

  try {
    await ensureLateDealProps();
  } catch (err) {
    console.error('could not add follow-up deal properties:', err && err.message);
  }

  const deals = await openDeals();
  const { due, skipped } = plan(deals, await contactsFor(deals), Date.now());

  // Sent when live, would be sent on a dry run.
  const emails = [];
  const failed = [];
  for (const f of due) {
    const p = f.deal.properties;
    const mail = renderEmail({
      step: f.step, dealId: f.deal.id, firstName: f.contact.firstname,
      year: p.vehicle_year, make: p.vehicle_make, model: p.vehicle_model,
      low: p.amount, high: p.sc_offer_high,
    });
    const line = `${f.contact.firstname || f.email}, ${[p.vehicle_year, p.vehicle_make, p.vehicle_model].join(' ')}: email ${f.step} of ${SCHEDULE.length} (day ${f.days})`;
    if (!live) { emails.push({ line, to: f.email, subject: mail.subject }); continue; }
    try {
      // Mark first: a failed write after a send would email them again tomorrow.
      await setSent(f.deal.id, f.step);
      const url = unsubscribeUrl(f.deal.id);
      await sendEmail({
        from: process.env.FOLLOWUP_FROM || `Scrappy Car <${domainAddress('hello')}>`,
        to: f.email,
        // Replies reach both owners.
        replyTo: process.env.FOLLOWUP_REPLY_TO ? process.env.FOLLOWUP_REPLY_TO.split(',').map((a) => a.trim()) : alertEmails(),
        subject: mail.subject,
        text: mail.text,
        headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        idempotencyKey: `followup/${f.deal.id}/${f.step}`,
      });
      emails.push({ line, to: f.email, subject: mail.subject });
      // Resend allows 2 requests a second by default.
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error('follow-up failed', f.deal.id, err && err.message);
      failed.push(`${line}: ${String(err && err.message).slice(0, 120)}`);
      await setSent(f.deal.id, f.sent).catch(() => {});
    }
  }

  if (live && (emails.length || failed.length)) {
    await notify([
      `📬 Follow-up emails: ${emails.length} sent${failed.length ? `, ${failed.length} failed` : ''}`,
      '',
      ...emails.map((e) => e.line),
      ...failed.map((f) => `FAILED ${f}`),
    ]).catch((err) => console.error('follow-up summary failed:', err && err.message));
  }

  console.log(JSON.stringify({ live, emails, failed, skipped }));
  return res.status(200).json({ live, emails, failed, skipped });
};

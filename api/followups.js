const {
  listAirtableLeads, updateAirtableLead, AIRTABLE_LEAD_FIELDS,
  resendConfigured, domainAddress, sendEmail, alertEmails, notify, capture,
} = require('./_lib');
const { MAX_DAYS, SCHEDULE, daysSince, dueStep, unsubscribeUrl, renderEmail } = require('./_followups');

// Daily cron (vercel.json): emails people whose Airtable lead is still at "Offer sent"
// on day 1, 5 and 21 after their offer. Anything that moves the deal on
// (accepted, booked, lost) or the unsubscribe link stops the emails.
//
// Sent from the domain through Resend, never the Gmail account. Nothing is sent
// unless FOLLOWUPS_LIVE=1 and Resend is set up. Otherwise, and with ?dry=1, it
// only returns who would get which email.

// One email per person per day at most: only their newest open deal counts,
// and an unsubscribe on any of their open deals stops all of them.
function plan(records, now) {
  const own = new Set([process.env.GMAIL_USER, ...alertEmails()].filter(Boolean).map((a) => a.toLowerCase()));
  const ownDomain = (process.env.RESEND_EMAIL_DOMAIN || '').toLowerCase();
  const byEmail = new Map();
  records.forEach((record) => {
    const f = record.fields || {};
    if (f[AIRTABLE_LEAD_FIELDS.stage] !== 'Offer sent') return;
    const email = String(f[AIRTABLE_LEAD_FIELDS.email] || '').trim().toLowerCase();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(record);
  });

  const due = [];
  const skipped = [];
  byEmail.forEach((theirs, email) => {
    const lead = theirs.reduce((a, b) => (Date.parse(b.createdTime) > Date.parse(a.createdTime) ? b : a));
    const p = lead.fields || {};
    const name = String(p[AIRTABLE_LEAD_FIELDS.contactName] || '').trim();
    const who = `${name || '?'} (lead ${lead.id})`;
    if (!email) return skipped.push(`${who}: no email`);
    if (own.has(email) || (ownDomain && email.endsWith(`@${ownDomain}`))) return skipped.push(`${who}: our own address`);
    if (/\btest\b/i.test(`${name} ${p[AIRTABLE_LEAD_FIELDS.lead] || ''}`)) return skipped.push(`${who}: test lead`);
    if (theirs.some((d) => d.fields && d.fields[AIRTABLE_LEAD_FIELDS.followupsStopped])) return skipped.push(`${who}: unsubscribed`);
    const days = daysSince(lead.createdTime, now);
    const sent = Number(p[AIRTABLE_LEAD_FIELDS.followupsSent]) || 0;
    const step = dueStep(days, sent);
    if (!step) return skipped.push(`${who}: day ${days}, ${sent} sent, nothing due`);
    due.push({ lead, name, email, step, days, sent });
  });
  return { due, skipped };
}

async function setSent(leadId, n) {
  await updateAirtableLead(leadId, { [AIRTABLE_LEAD_FIELDS.followupsSent]: n });
}

function offerHigh(range, low) {
  const amounts = String(range || '').match(/[\d,.]+/g) || [];
  const last = Number(amounts[amounts.length - 1] && amounts[amounts.length - 1].replace(/,/g, ''));
  return Number.isFinite(last) ? last : low;
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.AIRTABLE_TOKEN) return res.status(200).json({ skipped: 'AIRTABLE_TOKEN missing' });
  const live = process.env.FOLLOWUPS_LIVE === '1' && !(req.query && req.query.dry === '1') && resendConfigured();

  const { due, skipped } = plan(await listAirtableLeads(), Date.now());

  // Sent when live, would be sent on a dry run.
  const emails = [];
  const failed = [];
  for (const f of due) {
    const p = f.lead.fields || {};
    const low = Number(p[AIRTABLE_LEAD_FIELDS.offer]) || 0;
    const high = offerHigh(p[AIRTABLE_LEAD_FIELDS.priceRange], low);
    const mail = renderEmail({
      step: f.step, dealId: f.lead.id, firstName: f.name,
      year: p[AIRTABLE_LEAD_FIELDS.year], make: p[AIRTABLE_LEAD_FIELDS.make], model: p[AIRTABLE_LEAD_FIELDS.model],
      low, high,
    });
    const line = `${f.name || f.email}, ${[p[AIRTABLE_LEAD_FIELDS.year], p[AIRTABLE_LEAD_FIELDS.make], p[AIRTABLE_LEAD_FIELDS.model]].filter(Boolean).join(' ')}: email ${f.step} of ${SCHEDULE.length} (day ${f.days})`;
    if (!live) { emails.push({ line, to: f.email, subject: mail.subject }); continue; }
    try {
      // Mark first: a failed write after a send would email them again tomorrow.
      await setSent(f.lead.id, f.step);
      const url = unsubscribeUrl(f.lead.id);
      await sendEmail({
        from: process.env.FOLLOWUP_FROM || `Scrappy Car <${domainAddress('hello')}>`,
        to: f.email,
        // Replies reach both owners.
        replyTo: process.env.FOLLOWUP_REPLY_TO ? process.env.FOLLOWUP_REPLY_TO.split(',').map((a) => a.trim()) : alertEmails(),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        tags: { kind: 'followup', lead: f.lead.id, step: f.step },
        idempotencyKey: `followup/${f.lead.id}/${f.step}`,
      });
      emails.push({ line, to: f.email, subject: mail.subject });
      await capture('followup_sent', `lead-${f.lead.id}`, { lead_id: f.lead.id, step: f.step, days: f.days });
      // Resend allows 2 requests a second by default.
      await new Promise((r) => setTimeout(r, 600));
    } catch (err) {
      console.error('follow-up failed', f.lead.id, err && err.message);
      failed.push(`${line}: ${String(err && err.message).slice(0, 120)}`);
      await setSent(f.lead.id, f.sent).catch(() => {});
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

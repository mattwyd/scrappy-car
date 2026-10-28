const crypto = require('crypto');
const { hubspot, capture, notify } = require('./_lib');

// Resend webhook for follow-up emails. Each delivery outcome becomes a PostHog
// event on the same person as their site visit. A bounce or a spam complaint
// stops that deal's follow-ups, since mailing either again hurts the domain's
// reputation. Other email (lead alerts) has no "followup" tag and is ignored.

const EVENTS = {
  'email.delivered': 'followup_delivered',
  'email.delivery_delayed': 'followup_delayed',
  'email.bounced': 'followup_bounced',
  'email.complained': 'followup_complained',
  'email.failed': 'followup_failed',
};
const STOPS = new Set(['email.bounced', 'email.complained']);

// The signature covers the exact bytes Resend sent, so read the raw body when
// the runtime hasn't parsed it already.
async function rawBody(req) {
  const chunks = [];
  try {
    for await (const c of req) chunks.push(Buffer.from(c));
  } catch (e) {}
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  const b = req.body;
  if (typeof b === 'string') return b;
  if (Buffer.isBuffer(b)) return b.toString('utf8');
  return JSON.stringify(b || {});
}

// Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body".
function verifySvix(payload, headers, secret) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const sigs = headers['svix-signature'];
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const want = Buffer.from(crypto.createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64'));
  return String(sigs).split(' ').some((s) => {
    const got = Buffer.from(s.split(',')[1] || '');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

function tagsOf(data) {
  const t = data && data.tags;
  if (Array.isArray(t)) return Object.fromEntries(t.map((x) => [x.name, x.value]));
  return t && typeof t === 'object' ? t : {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  const payload = await rawBody(req);
  if (!verifySvix(payload, req.headers, process.env.RESEND_WEBHOOK_SECRET)) return res.status(401).json({ error: 'bad signature' });

  let event;
  try { event = JSON.parse(payload); } catch (e) { return res.status(400).json({ error: 'bad json' }); }
  const tags = tagsOf(event.data);
  const name = EVENTS[event.type];
  if (tags.kind !== 'followup' || !name || !/^\d+$/.test(tags.deal || '')) return res.status(200).json({ ignored: true });

  const props = { deal_id: tags.deal, step: Number(tags.step) || null };
  if (event.data.bounce) props.bounce_type = event.data.bounce.type || null;
  await capture(name, tags.ph || `deal-${tags.deal}`, props);

  if (STOPS.has(event.type)) {
    const why = event.type === 'email.complained' ? 'marked it as spam' : 'the address bounced';
    try {
      await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(tags.deal)}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties: { sc_followups_stopped: 'true' } }),
      });
      await notify([`📭 Follow-ups stopped for deal ${tags.deal}: ${why} (email ${tags.step}).`]);
    } catch (err) {
      console.error('could not stop follow-ups', tags.deal, err && err.message);
      await notify([
        `⚠️ FOLLOW-UPS NOT STOPPED (deal ${tags.deal})`,
        `The customer ${why}. Tick "Unsubscribed from follow-ups" on this deal in HubSpot.`,
      ]).catch(() => {});
    }
  }
  return res.status(200).json({ ok: true });
};

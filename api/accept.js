const { clean, readBody, acceptDeal, notify, offerText, throttled } = require('./_lib');

// HubSpot is optional (see quote.js): the customer's accept always succeeds and
// the owners always get the alert, whether or not the deal stage could move.
const HUBSPOT_BUDGET_MS = 6000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function alert(lines, id) {
  try {
    const notified = await notify(lines);
    if (!notified.sent) console.error('lead alert failed:', notified.reason, id);
  } catch (err) {
    console.error('lead alert threw:', err && err.message, id);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (throttled(req, 10, 60 * 1000)) return res.status(429).json({ error: 'slow down' });

  const id = clean(readBody(req).id, 40);
  if (!id) return res.status(400).json({ error: 'quote id required' });
  if (!/^(\d+|local-[a-z0-9]+)$/.test(id)) return res.status(400).json({ error: 'bad quote id' });

  // The lead details are in the quote alert with the same ref, so this alert
  // only has to say which one was accepted.
  const byRef = `💰 OFFER ACCEPTED (Ref: ${id}). Call to book pickup. Details are in the NEW INSTANT OFFER email with this ref.`;

  if (id.startsWith('local-') || !process.env.HUBSPOT_TOKEN) {
    await alert([byRef], id);
    return res.status(200).json({ ok: true });
  }

  let deal;
  try {
    deal = await withTimeout(acceptDeal(id), HUBSPOT_BUDGET_MS);
  } catch (err) {
    console.error('accept failed', err && err.message, id);
    await alert([byRef, '', `HubSpot deal not moved to "Offer accepted" (${String(err && err.message).slice(0, 120)}).`], id);
    return res.status(200).json({ ok: true });
  }

  // Already accepted: stay quiet rather than notifying twice.
  if (!deal) return res.status(200).json({ ok: true });

  const dealLink = process.env.HUBSPOT_PORTAL_ID
    ? `Update deal: https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/record/0-3/${id}`
    : null;
  await alert([`💰 OFFER ACCEPTED, ${offerText(deal.amount, deal.sc_offer_high)}. Call to book pickup.`, '', deal.description || deal.dealname, `Ref: ${id}`, dealLink], id);
  return res.status(200).json({ ok: true, offer: Number(deal.amount) });
};

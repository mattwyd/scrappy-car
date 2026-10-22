const { clean, readBody, acceptDeal, notify, throttled } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (throttled(req, 10, 60 * 1000)) return res.status(429).json({ error: 'slow down' });

  const id = clean(readBody(req).id, 40);
  if (!id) return res.status(400).json({ error: 'quote id required' });

  // Quote was shown while HubSpot was down: the owners already have the lead
  // details from the quote alert, so just tell them it was accepted.
  if (id.startsWith('local-')) {
    await notify([`💰 OFFER ACCEPTED (${id}), lead is in the earlier "NOT SAVED" alert. Add it to HubSpot.`]).catch(() => {});
    return res.status(200).json({ ok: true });
  }
  if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'bad quote id' });

  let deal;
  try {
    deal = await acceptDeal(id);
  } catch (err) {
    console.error('accept failed', err && err.message, id);
    return res.status(500).json({ error: 'could not record that' });
  }

  // Already accepted: stay quiet rather than notifying twice.
  if (!deal) return res.status(200).json({ ok: true });

  try {
    const notified = await notify([`💰 OFFER ACCEPTED, $${deal.amount}. Call to book pickup.`, '', deal.description || deal.dealname]);
    if (!notified.sent) console.error('lead alert failed:', notified.reason, id);
  } catch (err) {
    console.error('lead alert threw:', err && err.message, id);
  }

  return res.status(200).json({ ok: true, offer: Number(deal.amount) });
};

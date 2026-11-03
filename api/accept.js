const { clean, readBody, acceptAirtableLead, notify, throttled, AIRTABLE_LEAD_FIELDS } = require('./_lib');

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
  if (!/^(rec[a-zA-Z0-9]+|local-[a-z0-9]+)$/.test(id)) return res.status(400).json({ error: 'bad quote id' });

  // The lead details are in the quote alert with the same ref, so this alert
  // only has to say which one was accepted.
  const byRef = `💰 OFFER ACCEPTED (Ref: ${id}). Call to book pickup. Details are in the NEW INSTANT OFFER email with this ref.`;

  if (id.startsWith('local-') || !process.env.AIRTABLE_TOKEN) {
    await alert([byRef], id);
    return res.status(200).json({ ok: true });
  }

  let deal;
  try {
    deal = await acceptAirtableLead(id);
  } catch (err) {
    console.error('accept failed', err && err.message, id);
    await alert([byRef, '', `Airtable lead not moved to "Offer accepted" (${String(err && err.message).slice(0, 120)}).`], id);
    return res.status(200).json({ ok: true });
  }

  // Already accepted: stay quiet rather than notifying twice.
  if (!deal) return res.status(200).json({ ok: true });

  const offer = deal[AIRTABLE_LEAD_FIELDS.offer];
  const lead = deal[AIRTABLE_LEAD_FIELDS.lead];
  await alert([`💰 OFFER ACCEPTED${offer != null ? `, $${offer}` : ''}. Call to book pickup.`, '', lead || byRef, `Ref: ${id}`], id);
  return res.status(200).json({ ok: true, offer: Number(offer) || undefined });
};

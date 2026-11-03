const {
  bodyTypeFor, priceFor, offerText, clean, digits, toE164, readBody, throttled, createAirtableLead, notify,
  AIRTABLE_LEAD_FIELDS,
} = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (throttled(req, 8, 60 * 1000)) return res.status(429).json({ error: 'slow down' });

  const body = readBody(req);
  if (clean(body.company, 100)) return res.status(200).json({ id: 'x', offer: 0 });

  const year = digits(body.year, 2100);
  const make = clean(body.make, 60);
  const model = clean(body.model, 60);
  const name = clean(body.name, 60);
  const email = clean(body.email, 120);

  if (!year || !make || !model) return res.status(400).json({ error: 'year, make and model required' });
  if (!name) return res.status(400).json({ error: 'name required' });
  // Phone is how pickups get booked, so it's required; email is optional.
  const phone = toE164(body.phone);
  if (!phone) return res.status(400).json({ error: 'valid mobile number required' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email looks invalid' });

  const isRunning = body.is_running === true;
  const bodyType = bodyTypeFor(model, clean(body.body_type, 10));
  const city = clean(body.city, 60);
  // offer is the low end of the range; offerHigh equals it when there's no range.
  const { low: offer, high: offerHigh } = priceFor({ year, make, model, bodyType, isRunning, city });
  const km = digits(body.km, 9999999);
  const notes = clean(body.notes, 600);
  const photos = Array.isArray(body.photos)
    ? body.photos.filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 4)
    : [];

  const vehicle = `${year} ${make} ${model}`;
  const summary = [
    `${name} · ${phone}${email ? ' · ' + email : ''}`,
    `${vehicle} · ${isRunning ? 'runs & drives' : 'does NOT run'}${km ? ' · ' + km.toLocaleString('en-CA') + ' km' : ''}`,
    city ? `Where: ${city}` : null,
    notes ? `Notes: ${notes}` : null,
    photos.length ? `Photos: ${photos.join(' ')}` : null,
  ].filter(Boolean).join('\n');

  const fields = {
    [AIRTABLE_LEAD_FIELDS.lead]: `${vehicle}${city ? ' · ' + city : ''}`,
    [AIRTABLE_LEAD_FIELDS.contactName]: name,
    [AIRTABLE_LEAD_FIELDS.phone]: phone,
    [AIRTABLE_LEAD_FIELDS.year]: year,
    [AIRTABLE_LEAD_FIELDS.make]: make,
    [AIRTABLE_LEAD_FIELDS.model]: model,
    [AIRTABLE_LEAD_FIELDS.vehicleType]: bodyType,
    [AIRTABLE_LEAD_FIELDS.runsDrives]: isRunning ? 'Yes' : 'No',
    [AIRTABLE_LEAD_FIELDS.cat]: 'Unknown',
    [AIRTABLE_LEAD_FIELDS.alloys]: 'Unknown',
    [AIRTABLE_LEAD_FIELDS.photos]: photos.join('\n'),
    [AIRTABLE_LEAD_FIELDS.stage]: 'Offer sent',
    [AIRTABLE_LEAD_FIELDS.offer]: offer,
    [AIRTABLE_LEAD_FIELDS.priceRange]: offerText(offer, offerHigh),
    [AIRTABLE_LEAD_FIELDS.confidence]: 'Low',
  };
  if (email) fields[AIRTABLE_LEAD_FIELDS.email] = email;
  if (km != null) fields[AIRTABLE_LEAD_FIELDS.km] = km;
  if (city) fields[AIRTABLE_LEAD_FIELDS.location] = city;

  let id = null;
  let crmNote = null;
  try {
    id = await createAirtableLead(fields);
  } catch (err) {
    console.error('airtable write failed:', err && err.message, summary);
    crmNote = `Not saved to Airtable (${err && err.message ? err.message.slice(0, 120) : 'error'}).`;
  }
  if (!id) id = `local-${Date.now().toString(36)}`;

  try {
    const notified = await notify([`🚗 NEW INSTANT OFFER, ${offerText(offer, offerHigh)}`, '', summary, `Ref: ${id}`, crmNote], { replyTo: email });
    if (!notified.sent) console.error('lead alert failed:', notified.reason);
  } catch (err) {
    console.error('lead alert threw:', err && err.message);
  }

  return res.status(200).json({ id, offer, offer_high: offerHigh });
};

const {
  bodyTypeFor, priceFor, clean, digits, toE164, readBody, throttled, upsertContact, createDeal, notify,
  LATE_DEAL_PROPS, ensureLateDealProps,
} = require('./_lib');

const ATTR_FIELDS = ['gclid', 'gbraid', 'wbraid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

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
  const offer = priceFor(bodyType, isRunning);
  const city = clean(body.city, 60);
  const km = digits(body.km, 9999999);
  const rust = clean(body.condition, 30);
  const hasKeys = body.has_keys === true;
  const notes = clean(body.notes, 600);
  const photos = Array.isArray(body.photos)
    ? body.photos.filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 4)
    : [];

  // Attribution captured client-side by track.js (last touch wins for the deal).
  const attr = body.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const last = attr.last && typeof attr.last === 'object' ? attr.last : {};
  const first = attr.first && typeof attr.first === 'object' ? attr.first : {};

  const vehicle = `${year} ${make} ${model}`;
  // Which site sent them (chatgpt.com, perplexity.ai, google.com…). ChatGPT often
  // strips the referrer but tags links with utm_source, so fall back to that.
  const referrer = clean(last.referrer_host, 100) || clean(last.utm_source, 100);
  const summary = [
    `${name} · ${phone}${email ? ' · ' + email : ''}`,
    `${vehicle} · ${isRunning ? 'runs & drives' : 'does NOT run'}${km ? ' · ' + km.toLocaleString('en-CA') + ' km' : ''}${rust ? ' · rust: ' + rust : ''}${hasKeys ? '' : ' · no keys/ownership'}`,
    city ? `Where: ${city}` : null,
    notes ? `Notes: ${notes}` : null,
    photos.length ? `Photos: ${photos.join(' ')}` : null,
    `Source: ${clean(last.channel, 40) || 'unknown'}${referrer ? ` (${referrer})` : ''}${last.utm_campaign ? ' / ' + clean(last.utm_campaign, 100) : ''}`,
  ].filter(Boolean).join('\n');

  const dealProps = {
    dealname: `${vehicle}${city ? ' · ' + city : ''}`,
    amount: String(offer),
    description: summary,
    lead_source_detail: 'instant_offer_form',
    vehicle_year: String(year),
    vehicle_make: make,
    vehicle_model: model,
    vehicle_body_type: bodyType,
    vehicle_running: isRunning ? 'true' : 'false',
    vehicle_km: km == null ? '' : String(km),
    vehicle_rust: rust || '',
    vehicle_keys_ownership: hasKeys ? 'true' : 'false',
    vehicle_city: city || '',
    vehicle_photos: photos.join('\n'),
    sc_channel: clean(last.channel, 40) || '',
    sc_first_channel: clean(first.channel, 40) || '',
    sc_landing_page: clean(last.landing_page, 200) || clean(body.page, 200) || '',
    sc_posthog_id: clean(body.posthog_id, 100) || '',
    sc_referrer_host: clean(last.referrer_host, 100) || '',
    sc_first_referrer_host: clean(first.referrer_host, 100) || '',
  };
  ATTR_FIELDS.forEach((k) => { dealProps[`sc_${k}`] = clean(last[k], 200) || ''; });
  // HubSpot rejects '' on number fields; drop anything empty.
  Object.keys(dealProps).forEach((k) => { if (dealProps[k] === '') delete dealProps[k]; });

  let id;
  try {
    const contactId = await upsertContact({ email, name, phone, city });
    try {
      id = await createDeal(dealProps, contactId);
    } catch (err) {
      if (!/PROPERTY_DOESNT_EXIST|does not exist/i.test(String(err && err.message))) throw err;
      // HubSpot doesn't have the newer properties yet: add them and retry. If
      // that's not allowed, save the deal without them rather than lose the lead.
      try {
        await ensureLateDealProps();
        id = await createDeal(dealProps, contactId);
      } catch (e) {
        console.error('could not add newer deal properties:', e && e.message);
        LATE_DEAL_PROPS.forEach((p) => { delete dealProps[p.name]; });
        id = await createDeal(dealProps, contactId);
      }
    }
  } catch (err) {
    // Never lose a lead to a CRM outage: log everything and alert the owners,
    // then still show the customer their offer.
    console.error('hubspot write failed:', err && err.message, JSON.stringify(dealProps), summary);
    id = `local-${Date.now().toString(36)}`;
    await notify([`⚠️ LEAD NOT SAVED TO HUBSPOT (${id}), offer $${offer}`, '', summary], { replyTo: email }).catch(() => {});
    return res.status(200).json({ id, offer });
  }

  try {
    const notified = await notify([`🚗 NEW INSTANT OFFER, $${offer}`, '', summary], { replyTo: email });
    if (!notified.sent) console.error('lead alert failed:', notified.reason);
  } catch (err) {
    console.error('lead alert threw:', err && err.message);
  }

  return res.status(200).json({ id, offer });
};

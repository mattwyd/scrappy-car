const {
  bodyTypeFor, priceFor, offerText, clean, digits, toE164, readBody, notify,
  airtable, writeAirtableLead: writeLead, acceptAirtableLead, AIRTABLE_LEAD_FIELDS: F, AIRTABLE_LEADS_TABLE_ID: TABLE, leadUrl,
} = require('./_lib');
const { keyOk } = require('./_books');
const cal = require('./_calendar');

// Backs the call sheet (/call), the page open during a phone call. Every call
// needs the books key in the X-Books-Key header (same link key as /books).
//
//   GET  ?recent=1                  -> open leads from the last 3 weeks, to call back
//   GET  ?phone=4165551234          -> leads with that number
//   GET  ?slots=YYYY-MM-DD          -> pickups already booked that day (from Airtable)
//   POST { type: 'price', ...car }  -> the offer range
//   POST { type: 'save', id?, outcome, ...lead }
//        Creates or updates the Airtable lead. outcome: 'save' | 'offer' |
//        'accepted' | 'booked' (also emails calendar invites) | 'lost'.
//
// Like the instant offer, a save never fails because of Airtable or the
// calendar: whatever didn't save goes in the alert email instead.

const STAGES = ['New lead', 'Offer sent', 'Offer accepted', 'Appointment Scheduled', 'Picked up'];
const OPEN = ['New lead', 'Offer sent', 'Offer accepted'];
const OUTCOME_STAGE = { offer: 'Offer sent', accepted: 'Offer accepted', booked: 'Appointment Scheduled' };
// The call sheet's "How did they find us?" answers, as the site's channel names.
const CHANNELS = ['google_ads', 'gbp', 'organic', 'referral', 'offline', 'other'];
const OWNERSHIP = { yes: 'in their name', owner: 'owner will be at pickup', no: 'no ownership' };
const YARD_ADDRESS = 'Scrappy Car, 125 Island Rd, Scarborough, ON M1C 2P7';
const BUSINESS_PHONE = '(647) 204-4200';

const rank = (stage) => STAGES.indexOf(stage);
const yesNo = (v, yes, no) => (v === yes ? 'Yes' : v === no ? 'No' : 'Unknown');
const fromYesNo = (v, yes, no) => (v === 'Yes' ? yes : v === 'No' ? no : 'unknown');

function carFrom(b) {
  const model = clean(b.model, 60);
  const runs = ['yes', 'no'].includes(b.runs) ? b.runs : 'unknown';
  return {
    year: digits(b.year, 2100), make: clean(b.make, 60), model,
    bodyType: bodyTypeFor(model, clean(b.body_type, 10)),
    km: digits(b.km, 9999999), city: clean(b.city, 60),
    runs, isRunning: runs === 'yes',
    rims: ['alloy', 'steel'].includes(b.rims) ? b.rims : 'unknown',
    cat: ['original', 'aftermarket', 'none'].includes(b.cat) ? b.cat : 'unknown',
    dropOff: b.drop_off === true,
  };
}

const carName = (c) => [c.year, c.make, c.model].filter(Boolean).join(' ');

// null until year, make and model are in. Unknown rims and cat are priced the
// way the website prices them (steel rims, original cat).
function quote(c) {
  if (!c.year || !c.make || !c.model) return null;
  const { low, high } = priceFor({
    ...c, rims: c.rims === 'unknown' ? undefined : c.rims, cat: c.cat === 'unknown' ? undefined : c.cat,
  });
  const assumed = [
    c.runs === 'unknown' && 'not running', c.rims === 'unknown' && 'steel rims', c.cat === 'unknown' && 'original cat',
  ].filter(Boolean);
  return { low, high, text: offerText(low, high), assumed };
}

// Keys, ownership and drop-off ride in Call Notes as their own lines so the
// sheet can read them back.
function notesText({ keys, ownership, dropOff, notes }) {
  return [
    keys && `Keys: ${keys}`,
    ownership && `Ownership: ${OWNERSHIP[ownership]}`,
    dropOff && 'Drop-off: yes',
    notes,
  ].filter(Boolean).join('\n');
}

function parseNotes(text) {
  const out = { keys: '', ownership: '', drop_off: false, notes: '' };
  const rest = [];
  String(text || '').split('\n').forEach((line) => {
    const keys = /^Keys: (yes|no)$/i.exec(line);
    const owner = /^Ownership: (.+)$/i.exec(line);
    const ownerKey = owner && Object.keys(OWNERSHIP).find((k) => OWNERSHIP[k] === owner[1]);
    if (keys) out.keys = keys[1].toLowerCase();
    else if (ownerKey) out.ownership = ownerKey;
    else if (/^Drop-off: yes$/i.test(line)) out.drop_off = true;
    else rest.push(line);
  });
  out.notes = rest.join('\n').trim();
  return out;
}

// An Airtable record in the shape the sheet's form uses.
function toForm(r) {
  const f = r.fields || {};
  const parsed = parseNotes(f[F.notes]);
  return {
    id: r.id, url: leadUrl(r.id), created: r.createdTime, stage: f[F.stage] || '', lead: f[F.lead] || '',
    name: f[F.contactName] || '', phone: f[F.phone] || '', email: f[F.email] || '',
    year: f[F.year] || '', make: f[F.make] || '', model: f[F.model] || '',
    body_type: ['car', 'truck'].includes(f[F.vehicleType]) ? f[F.vehicleType] : '',
    channel: f[F.channel] || '',
    km: f[F.km] || '', city: f[F.location] || '', address: f[F.address] || '',
    runs: fromYesNo(f[F.runsDrives], 'yes', 'no'),
    rims: fromYesNo(f[F.alloys], 'alloy', 'steel'),
    cat: fromYesNo(f[F.cat], 'original', 'aftermarket'),
    saved_offer: f[F.offer] || '', range: f[F.priceRange] || '', lost_reason: f[F.lostReason] || '',
    pickup: [f[F.pickupDate], f[F.pickupWindow]].filter(Boolean).join(', '),
    photos: String(f[F.photos] || '').split(/\s+/).filter((u) => u.startsWith('https://')),
    ...parsed,
  };
}

async function findLeads(formula, max) {
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: String(max), pageSize: String(max) });
  const { records = [] } = await airtable(`/${TABLE}?${q}`);
  return records
    .map(toForm)
    .sort((a, b) => (b.stage === 'Offer accepted') - (a.stage === 'Offer accepted') || b.created.localeCompare(a.created));
}

async function save(b) {
  const id = /^rec[a-zA-Z0-9]{14}$/.test(b.id || '') ? b.id : null;
  const outcome = ['offer', 'accepted', 'booked', 'lost'].includes(b.outcome) ? b.outcome : 'save';
  const car = carFrom(b);
  const price = quote(car);
  const name = clean(b.name, 60);
  const phone = toE164(b.phone);
  const email = clean(b.email, 120);
  const address = clean(b.address, 160);
  const agreed = digits(b.agreed, 100000);
  const lostReason = clean(b.lost_reason, 120);
  const channel = CHANNELS.includes(b.channel) ? b.channel : '';
  const keys = ['yes', 'no'].includes(b.keys) ? b.keys : '';
  const ownership = OWNERSHIP[b.ownership] ? b.ownership : '';
  const notes = notesText({ keys, ownership, dropOff: car.dropOff, notes: clean(b.notes, 2000) });

  if (!id && !phone) return { status: 400, error: 'Phone number needed to save a new lead.' };
  if (clean(b.phone, 30) && !phone) return { status: 400, error: 'Phone number looks wrong (10 digits).' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, error: 'Email looks wrong.' };
  if (outcome === 'lost' && !lostReason) return { status: 400, error: 'Pick why they are not selling.' };
  let slot = null;
  if (outcome === 'booked') {
    if (!price) return { status: 400, error: 'Year, make and model needed to book.' };
    if (!address && !car.dropOff) return { status: 400, error: 'Exact pickup address needed to book.' };
    if (!cal.validSlot(b.date, b.window)) return { status: 400, error: 'Pick a day and a time window.' };
    slot = { date: b.date, start: Number(b.window) };
    slot.window = cal.windowLabel(slot.start);
    slot.label = `${cal.dayLabel(slot.date)}, ${slot.window}`;
  }

  const fields = {};
  const put = (key, value) => { if (value != null && value !== '') fields[F[key]] = value; };
  if (price) {
    put('lead', `${carName(car)}${car.city ? ' · ' + car.city : ''}`);
    put('offer', agreed || price.low);
    put('priceRange', price.text);
    put('confidence', car.rims !== 'unknown' && car.cat !== 'unknown' ? 'Medium' : 'Low');
  }
  put('contactName', name); put('phone', phone); put('email', email);
  put('year', car.year); put('make', car.make); put('model', car.model);
  if (car.model) put('vehicleType', car.bodyType);
  put('km', car.km); put('location', car.city); put('address', address);
  if (!id || car.runs !== 'unknown') put('runsDrives', yesNo(car.runs, 'yes', 'no'));
  if (!id || car.rims !== 'unknown') put('alloys', yesNo(car.rims, 'alloy', 'steel'));
  if (!id || car.cat !== 'unknown') put('cat', car.cat === 'unknown' ? 'Unknown' : car.cat === 'original' ? 'Yes' : 'No');
  if (id || notes) fields[F.notes] = notes;
  if (outcome === 'lost') put('lostReason', lostReason);
  if (slot) { put('pickupDate', slot.date); put('pickupWindow', slot.window); }
  if (!id) put('source', 'Phone call');
  put('channel', channel);
  if (!id) put('firstChannel', channel);

  const warnings = [];
  let recId = id;
  let stage = null;
  let current = null;
  let before = {};
  let skipped = [];
  if (!process.env.AIRTABLE_TOKEN) {
    warnings.push('Not saved to Airtable (AIRTABLE_TOKEN missing). The alert email has the details.');
  } else {
    try {
      before = id ? (await airtable(`/${TABLE}/${encodeURIComponent(id)}`)).fields || {} : {};
      current = before[F.stage] || null;
      if (outcome === 'lost') stage = 'Lost';
      else if (outcome === 'save' && current) stage = current;
      else {
        const want = OUTCOME_STAGE[outcome] || (price ? 'Offer sent' : 'New lead');
        stage = current && current !== 'Lost' && rank(current) >= rank(want) ? current : want;
      }
      // Into "Offer accepted" the same way the website's accept button goes, so
      // the Airtable P&L automation sees the same change.
      const viaAccept = rank(stage) >= rank('Offer accepted') && !(rank(current) >= rank('Offer accepted'));
      const written = await writeLead(id, { ...fields, [F.stage]: viaAccept ? 'Offer sent' : stage });
      recId = written.id;
      skipped = written.skipped;
      if (viaAccept) {
        await acceptAirtableLead(recId);
        if (stage !== 'Offer accepted') await writeLead(recId, { [F.stage]: stage });
      }
    } catch (err) {
      console.error('call sheet airtable write failed:', err && err.message);
      warnings.push(`Not saved to Airtable (${String(err && err.message).slice(0, 140)}). The alert email has the details.`);
    }
  }
  if (skipped.length) warnings.push(`Airtable has no ${skipped.join(', ')} field yet, so that is only in the alert email.`);

  let event = null;
  if (slot && !cal.invitesConfigured()) {
    warnings.push('Email is not set up (Resend), so no calendar invites went out.');
  } else if (slot) {
    const pay = agreed ? `$${agreed}` : price.text;
    const what = car.dropOff ? 'drop-off' : 'pickup';
    const location = car.dropOff ? YARD_ADDRESS : address;
    try {
      event = await cal.createPickup({
        leadId: recId, date: slot.date, start: slot.start, email,
        customer: {
          summary: `Scrappy Car ${what}: ${carName(car)}`,
          location,
          description: [
            `${carName(car)}${car.dropOff ? ', dropped off at our yard' : ''}`,
            `Offer: ${pay}${agreed ? '' : ', confirmed when we see the car'}`,
            'Please have the ownership and the keys ready.',
            `Questions or need another time? Call or text ${BUSINESS_PHONE}.`,
            'https://scrappycar.ca',
          ].join('\n'),
        },
        team: {
          summary: `${what}: ${carName(car)}${name ? ` (${name})` : ''}`,
          location,
          description: [
            [name, phone, email].filter(Boolean).join(', '),
            `Offer: ${agreed ? `$${agreed} agreed (range ${price.text})` : price.text}`,
            notes || null,
            recId ? `Airtable: ${leadUrl(recId)}` : null,
          ].filter(Boolean).join('\n'),
        },
      });
      event.errors.forEach((e) => warnings.push(`Invite not sent (${e.slice(0, 140)}).`));
    } catch (err) {
      console.error('call sheet invites failed:', err && err.message);
      warnings.push(`No calendar invites went out (${String(err && err.message).slice(0, 140)}).`);
    }
  }

  // A booked pickup that's now lost comes off the calendars.
  const wasBooked = current === 'Appointment Scheduled' && before[F.pickupDate] && before[F.pickupWindow];
  if (outcome === 'lost' && wasBooked && cal.invitesConfigured()) {
    const start = cal.WINDOWS.find((w) => cal.windowLabel(w) === before[F.pickupWindow]);
    if (start != null && cal.validSlot(before[F.pickupDate], start)) {
      const errors = await cal.cancelPickup({
        leadId: recId, date: before[F.pickupDate], start, email: email || before[F.email],
        summary: `Scrappy Car pickup: ${before[F.lead] || carName(car)}`,
      });
      warnings.push(errors.length ? `Calendar cancellation not sent (${errors.join('; ').slice(0, 140)}).` : 'Pickup cancelled on the calendars.');
    }
  }

  // Alert the team about new phone leads and offers accepted on a call; an
  // update to a lead that's already known stays quiet. A booking is made by one
  // of us and lands on the team calendar, so it only alerts when the team invite
  // or the Airtable save failed and the alert is the only record of it.
  const bookingQuiet = slot && event && event.team && !warnings.length;
  const heading = slot ? (bookingQuiet ? null : `📅 ${car.dropOff ? 'DROP-OFF' : 'PICKUP'} BOOKED, ${slot.label}`)
    : outcome === 'accepted' ? `💰 OFFER ACCEPTED ON A CALL${agreed ? `, $${agreed}` : price ? `, ${price.text}` : ''}`
      : !id && outcome !== 'lost' ? `📞 PHONE LEAD${price ? `, ${price.text}` : ''}` : null;
  if (heading) {
    const condition = [
      car.runs === 'yes' ? 'runs' : car.runs === 'no' ? 'does NOT run' : null,
      car.rims !== 'unknown' ? `${car.rims} rims` : null,
      car.cat !== 'unknown' ? `cat: ${car.cat}` : null,
      car.km ? `${car.km.toLocaleString('en-CA')} km` : null,
    ].filter(Boolean).join(' · ');
    const lines = [
      heading, '',
      [name, phone, email].filter(Boolean).join(' · '),
      [carName(car), condition].filter(Boolean).join(' · ') || null,
      price ? `Offer: ${agreed ? `$${agreed} agreed (range ${price.text})` : price.text}` : null,
      car.dropOff ? 'Drop-off at the yard' : address ? `Address: ${address}` : car.city ? `Where: ${car.city}` : null,
      slot ? (event && event.team ? 'Calendar invite sent to the team' + (event.customer ? ' and the customer.' : '.') : 'No calendar invite went out.') : null,
      notes ? `Notes: ${notes.replace(/\n/g, ' · ')}` : null,
      recId ? `Airtable: ${leadUrl(recId)}` : null,
      ...warnings,
    ];
    try {
      const notified = await notify(lines.filter((l) => l !== null), { replyTo: email });
      if (!notified.sent) console.error('call sheet alert failed:', notified.reason);
    } catch (err) {
      console.error('call sheet alert threw:', err && err.message);
    }
  }

  return {
    status: 200,
    body: {
      ok: true, id: recId, url: recId ? leadUrl(recId) : null, stage, saved: !!recId && !warnings.some((w) => w.startsWith('Not saved')),
      price, booked: slot ? { label: slot.label, invited: !!(event && event.customer), team: !!(event && event.team) } : null, warnings,
    },
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!keyOk(req.headers['x-books-key'])) return res.status(401).json({ error: 'bad key' });

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.slots !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(q.slots)) return res.status(400).json({ error: 'slots must be YYYY-MM-DD' });
        if (!process.env.AIRTABLE_TOKEN) return res.status(200).json({ configured: false, windows: cal.WINDOWS });
        return res.status(200).json({ configured: true, windows: cal.WINDOWS, booked: await cal.bookingsOn(q.slots) });
      }
      if (!process.env.AIRTABLE_TOKEN) return res.status(200).json({ leads: [], warning: 'AIRTABLE_TOKEN missing' });
      if (q.phone !== undefined) {
        const ten = String(q.phone).replace(/\D/g, '').slice(-10);
        if (ten.length !== 10) return res.status(400).json({ error: 'phone must have 10 digits' });
        return res.status(200).json({ leads: await findLeads(`RIGHT(REGEX_REPLACE({${F.phone}}&"","[^0-9]",""),10)="${ten}"`, 5) });
      }
      if (q.recent !== undefined) {
        const open = OPEN.map((s) => `{${F.stage}}="${s}"`).join(',');
        return res.status(200).json({ leads: await findLeads(`AND(OR(${open}),IS_AFTER(CREATED_TIME(),DATEADD(TODAY(),-21,"days")))`, 30) });
      }
      return res.status(400).json({ error: 'unknown request' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const body = readBody(req);
    if (body.type === 'price') return res.status(200).json({ price: quote(carFrom(body)) });
    if (body.type === 'save') {
      const result = await save(body);
      return res.status(result.status).json(result.body || { error: result.error });
    }
    return res.status(400).json({ error: 'unknown request' });
  } catch (err) {
    console.error('call sheet failed:', err && err.message);
    return res.status(500).json({ error: String(err && err.message).slice(0, 200) });
  }
};

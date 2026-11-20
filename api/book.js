// The offer screen's "Get paid" step: the customer picks a pickup time and
// that counts as accepting the offer. POST { id, date, start, address, email? }.
//
// Moves the lead to Appointment Scheduled, saves the address, stops the
// follow-ups, emails calendar invites (customer if we have an email, team
// always) and alerts the team. Like the quote, it never fails because of
// Airtable or email: whatever didn't save goes in the alert.
const {
  clean, readBody, notify, throttled, offerText, airtable, updateAirtableLead,
  AIRTABLE_LEAD_FIELDS: F, AIRTABLE_LEADS_TABLE_ID: TABLE, STAGE, ACCEPTED_NOTE, leadUrl,
} = require('./_lib');
const cal = require('./_calendar');
const { siteSlots } = require('./_busy');

const BUSINESS_PHONE = '(647) 204-4200';
const BOOKED_NOTE = 'Booked a pickup on the website';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (throttled(req, 10, 60 * 1000)) return res.status(429).json({ error: 'slow down' });

  const b = readBody(req);
  const id = clean(b.id, 40);
  if (!id || !/^(rec[a-zA-Z0-9]+|local-[a-z0-9]+)$/.test(id)) return res.status(400).json({ error: 'quote id required' });
  const address = clean(b.address, 160);
  if (!address || address.length < 6) return res.status(400).json({ error: 'address' });
  let email = clean(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = null;
  const date = String(b.date || '');
  const start = Number(b.start);

  // Re-check against the calendar: the time has to still be one we offer.
  const { days } = await siteSlots();
  const day = days.find((d) => d.date === date);
  if (!day || !day.slots.some((s) => s.start === start)) {
    return res.status(409).json({ error: 'taken', days });
  }
  const label = `${cal.dayLabel(date)}, ${cal.windowLabel(start)}`;

  // From the client, only used when there's no Airtable lead to read.
  const given = {
    name: clean(b.name, 60), phone: clean(b.phone, 30), car: clean(b.car, 80),
    offer: Number(b.offer) || null, offerHigh: Number(b.offer_high) || null,
  };

  const warnings = [];
  let f = {};
  let alreadyBooked = false;
  if (id.startsWith('rec') && process.env.AIRTABLE_TOKEN) {
    try {
      f = (await airtable(`/${TABLE}/${encodeURIComponent(id)}`)).fields || {};
      alreadyBooked = String(f[F.notes] || '').includes(`${BOOKED_NOTE} for ${label}`);
      const notes = String(f[F.notes] || '');
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' });
      const add = [
        !notes.includes(ACCEPTED_NOTE) && `${ACCEPTED_NOTE} (${today}).`,
        !alreadyBooked && `${BOOKED_NOTE} for ${label} (${today}).`,
      ].filter(Boolean);
      const fields = {
        [F.address]: address,
        [F.followupsStopped]: true,
      };
      if (add.length) fields[F.notes] = [notes, ...add].filter(Boolean).join('\n');
      // Never move a lead backwards (or out of Lost) from the website.
      if (!f[F.stage] || f[F.stage] === STAGE.lead) fields[F.stage] = STAGE.booked;
      if (email && !f[F.email]) fields[F.email] = email;
      await updateAirtableLead(id, fields);
    } catch (err) {
      console.error('book airtable failed:', err && err.message, id);
      warnings.push(`Airtable not updated (${String(err && err.message).slice(0, 120)}). Set the lead to Appointment Scheduled by hand.`);
    }
  } else if (id.startsWith('rec')) {
    warnings.push('Not saved to Airtable (AIRTABLE_TOKEN missing).');
  }

  // A double tap or a retry after a slow response: already done, stay quiet.
  if (alreadyBooked) return res.status(200).json({ ok: true, label });

  const name = f[F.contactName] || given.name || '';
  const phone = f[F.phone] || given.phone || '';
  const custEmail = email || f[F.email] || '';
  const car = [f[F.year], f[F.make], f[F.model]].filter(Boolean).join(' ') || given.car || 'Car';
  const offer = f[F.offer] || given.offer;
  const range = offer ? offerText(offer, given.offerHigh || offer) : null;

  let event = null;
  if (!cal.invitesConfigured()) {
    warnings.push('Email (Resend) not set up, so no calendar invites went out.');
  } else {
    try {
      event = await cal.createPickup({
        leadId: id, date, start, email: custEmail,
        customer: {
          summary: `Scrappy Car pickup: ${car}`,
          location: address,
          description: [
            `We're coming to pick up your ${car} and pay you${range ? ` (offer: ${range})` : ''}.`,
            'Please have the ownership and the keys ready.',
            `Need another time? Call or text ${BUSINESS_PHONE}.`,
            'https://scrappycar.ca',
          ].join('\n'),
        },
        team: {
          summary: `pickup: ${car}${name ? ` (${name})` : ''}`,
          location: address,
          description: [
            'Booked by the customer on the website.',
            [name, phone, custEmail].filter(Boolean).join(', '),
            range ? `Offer: ${range}` : null,
            id.startsWith('rec') ? `Airtable: ${leadUrl(id)}` : null,
          ].filter(Boolean).join('\n'),
        },
      });
      event.errors.forEach((e) => warnings.push(`Invite not sent (${e.slice(0, 140)}).`));
    } catch (err) {
      console.error('book invites failed:', err && err.message, id);
      warnings.push(`No calendar invites went out (${String(err && err.message).slice(0, 140)}). Put it on the calendar by hand.`);
    }
  }

  try {
    const notified = await notify([
      `📅 PICKUP BOOKED ON THE SITE, ${label}${range ? `, ${range}` : ''}`,
      '',
      [name, phone, custEmail].filter(Boolean).join(' · ') || null,
      car,
      `Address: ${address}`,
      'Text them to confirm.',
      event && event.team ? `Calendar invite sent to the team${event.customer ? ' and the customer' : ''}.` : null,
      f[F.lead] ? f[F.lead] : null,
      `Ref: ${id}`,
      ...warnings,
    ].filter((l) => l !== null), { replyTo: custEmail || undefined });
    if (!notified.sent) console.error('book alert failed:', notified.reason, id);
  } catch (err) {
    console.error('book alert threw:', err && err.message, id);
  }

  return res.status(200).json({ ok: true, label, invited: !!(event && event.customer) });
};

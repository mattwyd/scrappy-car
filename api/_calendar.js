// Pickup bookings for the call sheet (api/call.js). A booking is a calendar
// invite (.ics) emailed from hello@ through Resend: one to the customer when
// they gave an email, one to the team (ALERT_EMAILS) with the details. Gmail
// puts both straight on Google Calendar, so there's no Google sign-in to keep
// alive. Google Calendar is the record of when pickups are; Airtable only
// says a lead is "Appointment Scheduled". The invite UID is per lead, so
// rebooking moves the event instead of adding a second one.
const crypto = require('crypto');
const { resendConfigured, domainAddress, sendEmail, alertEmails } = require('./_lib');

const TZ = 'America/Toronto';
const WINDOW_HOURS = 1;
const WINDOWS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]; // start hours: 8am to 10pm in 1-hour windows

const pad = (n) => String(n).padStart(2, '0');

// Toronto's UTC offset on a date, like "-05:00". Noon is past any DST switch.
function torontoOffset(date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName');
  const offset = part ? part.value.replace('GMT', '') : '';
  return offset || '+00:00';
}

function torontoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const windowLabel = (start) => `${hourLabel(start)} to ${hourLabel(start + WINDOW_HOURS)}`;
const dayLabel = (date) => new Date(`${date}T12:00:00Z`)
  .toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

// A pickup slot from the page: today up to 60 days out, one of WINDOWS.
function validSlot(date, start) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !WINDOWS.includes(Number(start))) return false;
  const days = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${torontoToday()}T12:00:00Z`)) / 86400000;
  return days >= 0 && days <= 60;
}

const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines over 75 octets fold onto continuation lines that start with a space.
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut--;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

function invite({ uid, date, start, summary, location, description, organizer, attendees }) {
  const begin = Date.parse(`${date}T${pad(start)}:00:00${torontoOffset(date)}`);
  return [
    'BEGIN:VCALENDAR', 'PRODID:-//Scrappy Car//Call sheet//EN', 'VERSION:2.0', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    // Each send outranks the last, so a rebooking replaces the earlier time.
    `SEQUENCE:${Math.floor(Date.now() / 1000) - 1790000000}`,
    `DTSTAMP:${icsTime(Date.now())}`,
    `DTSTART:${icsTime(begin)}`,
    `DTEND:${icsTime(begin + WINDOW_HOURS * 3600000)}`,
    `SUMMARY:${icsText(summary)}`,
    location ? `LOCATION:${icsText(location)}` : null,
    `DESCRIPTION:${icsText(description)}`,
    `ORGANIZER;CN=Scrappy Car:mailto:${organizer}`,
    ...attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a}`),
    'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Pickup', 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).map(fold).join('\r\n') + '\r\n';
}

function invitesConfigured() {
  return resendConfigured();
}

async function sendInvite({ to, subject, text, replyTo, ...event }) {
  const ics = invite({ ...event, organizer: domainAddress('hello'), attendees: [].concat(to) });
  await sendEmail({
    from: `Scrappy Car <${domainAddress('hello')}>`, to, replyTo, subject, text,
    attachments: [{ filename: 'pickup.ics', content: Buffer.from(ics).toString('base64'), content_type: 'text/calendar; charset=utf-8; method=REQUEST' }],
    idempotencyKey: crypto.createHash('sha256').update(ics.replace(/^(SEQUENCE|DTSTAMP):.*$/gm, '')).digest('hex'),
  });
}

// customer: what the customer sees ({ summary, location, description }), sent
// only when they gave an email. team: the same pickup with the internal
// details, sent to ALERT_EMAILS. Returns which were sent; throws only if both fail.
async function createPickup({ leadId, date, start, email, customer, team }) {
  const uid = `pickup-${leadId || crypto.randomBytes(8).toString('hex')}@scrappycar.ca`;
  const label = `${dayLabel(date)}, ${windowLabel(start)}`;
  const sent = { customer: false, team: false };
  const errors = [];
  if (email) {
    try {
      await sendInvite({
        uid: `c-${uid}`, date, start, ...customer, to: email, replyTo: alertEmails(),
        subject: `Your Scrappy Car pickup: ${label}`, text: customer.description,
      });
      sent.customer = true;
    } catch (err) { errors.push(`customer invite: ${err && err.message}`); }
  }
  if (alertEmails().length) {
    try {
      await sendInvite({ uid: `t-${uid}`, date, start, ...team, to: alertEmails(), subject: `Pickup: ${label}, ${team.summary}`, text: team.description });
      sent.team = true;
    } catch (err) { errors.push(`team invite: ${err && err.message}`); }
  }
  if (errors.length && !sent.customer && !sent.team) throw new Error(errors.join('; '));
  if (errors.length) console.error('pickup invite partly failed:', errors.join('; '));
  return { ...sent, errors };
}

module.exports = {
  WINDOWS, invitesConfigured, createPickup, validSlot, windowLabel, dayLabel, torontoToday, invite,
};

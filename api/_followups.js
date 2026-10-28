// Follow-up emails for offers nobody accepted: schedule, copy and unsubscribe
// links. Used by api/followups.js (the daily cron) and api/unsubscribe.js.
const crypto = require('crypto');
const { offerText } = require('./_lib');

// Days after the offer, in Toronto calendar days, that emails 1, 2 and 3 go out.
const SCHEDULE = [1, 5, 21];
// Past this the lead is stale; a missed email is skipped, never sent late.
const MAX_DAYS = 28;

const SITE = process.env.SITE_URL || 'https://scrappycar.ca';
const PHONE = '(647) 204-4200';

function torontoDate(t) {
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }); // YYYY-MM-DD
}

function daysSince(created, now) {
  return Math.round((Date.parse(torontoDate(now)) - Date.parse(torontoDate(created))) / 864e5);
}

// The email to send now (1, 2 or 3), or 0. If the cron missed a day it sends
// only the latest email that's due, so nobody gets two at once.
function dueStep(days, sent) {
  if (days > MAX_DAYS) return 0;
  const step = SCHEDULE.filter((d) => days >= d).length;
  return step > sent ? step : 0;
}

function sign(dealId) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET).update(`unsubscribe:${dealId}`).digest('base64url').slice(0, 32);
}

function verify(dealId, sig) {
  if (!process.env.CRON_SECRET || typeof sig !== 'string') return false;
  const want = Buffer.from(sign(dealId));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function unsubscribeUrl(dealId) {
  return `${SITE}/api/unsubscribe?d=${encodeURIComponent(dealId)}&s=${sign(dealId)}`;
}

function hello(firstName) {
  const name = (firstName || '').trim();
  return name ? `Hi ${name[0].toUpperCase()}${name.slice(1)},` : 'Hi there,';
}

// Plain text on purpose: it reads like a note from a person and lands in the
// inbox rather than the promotions tab.
function renderEmail({ step, dealId, firstName, year, make, model, low, high }) {
  const car = [year, make, model].filter(Boolean).join(' ') || 'your car';
  const short = model || 'car';
  const offer = offerText(low, high);
  const sign_off = ['Sean and Matt', 'Scrappy Car', PHONE];
  const bodies = {
    1: {
      subject: `Your offer for the ${car}`,
      lines: [
        `Thanks for getting an offer for your ${car} on scrappycar.ca. Your offer is ${offer}, with free towing and cash in hand at pickup.`,
        '',
        `Want to go ahead? Reply to this email or call or text ${PHONE}, and we'll book a pickup time that works for you. Same day is often possible.`,
      ],
    },
    2: {
      subject: `Still have the ${short}?`,
      lines: [
        `Just checking in on your ${car}. Your offer of ${offer} still stands, as long as the car is as you described it.`,
        '',
        "If something is holding you back, like the paperwork, the plates or the price, reply here and we'll help you sort it out.",
      ],
    },
    3: {
      subject: `Last check-in about your ${short}`,
      lines: [
        `This is our last note about your ${car}. If you've already sold it, no worries.`,
        '',
        `If it's still sitting there, reply or call ${PHONE} and we'll confirm today's price and pick it up within a day or two. Got a better offer somewhere else? Send us the number and we'll see if we can match it.`,
      ],
    },
  };
  const b = bodies[step];
  const text = [
    hello(firstName), '', ...b.lines, '', ...sign_off, '',
    '--',
    'Scrappy Car, 125 Island Rd, Scarborough, ON. scrappycar.ca',
    "You're getting this because you asked for an offer on scrappycar.ca.",
    `Stop these emails: ${unsubscribeUrl(dealId)}`,
  ].join('\n');
  return { subject: b.subject, text };
}

module.exports = { SCHEDULE, MAX_DAYS, daysSince, dueStep, sign, verify, unsubscribeUrl, renderEmail };

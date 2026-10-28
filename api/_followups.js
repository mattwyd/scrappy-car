// Follow-up emails for offers nobody accepted: schedule, copy, signed links.
// Used by api/followups.js (the daily cron), api/go.js (button taps) and
// api/unsubscribe.js.
const crypto = require('crypto');
const { offerText } = require('./_lib');

// Days after the offer, in Toronto calendar days, that emails 1, 2 and 3 go out.
const SCHEDULE = [1, 5, 21];
// Past this the lead is stale; a missed email is skipped, never sent late.
const MAX_DAYS = 28;

const SITE = process.env.SITE_URL || 'https://scrappycar.ca';
const PHONE = '(647) 204-4200';
const PHONE_E164 = '+16472044200';

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

// Links in the emails are signed so nobody can forge unsubscribes or clicks.
function sign(payload) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET).update(payload).digest('base64url').slice(0, 32);
}

function signedOk(payload, sig) {
  if (!process.env.CRON_SECRET || typeof sig !== 'string') return false;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const unsubPayload = (dealId) => `unsubscribe:${dealId}`;
const verify = (dealId, sig) => signedOk(unsubPayload(dealId), sig);

function unsubscribeUrl(dealId) {
  return `${SITE}/api/unsubscribe?d=${encodeURIComponent(dealId)}&s=${sign(unsubPayload(dealId))}`;
}

// Button taps go through /api/go, which counts the tap and then opens the
// phone or messages app. Only these destinations exist, so it can't be used
// to redirect anywhere else.
const GO_TARGETS = { call: `tel:${PHONE_E164}`, text: `sms:${PHONE_E164}` };
const goPayload = (dealId, step, action, ph) => `go:${dealId}:${step}:${action}:${ph || ''}`;

function goUrl(dealId, step, action, ph) {
  const q = new URLSearchParams({ d: dealId, n: String(step), a: action });
  if (ph) q.set('p', ph);
  q.set('s', sign(goPayload(dealId, step, action, ph)));
  return `${SITE}/api/go?${q}`;
}

function hello(firstName) {
  const name = (firstName || '').trim();
  return name ? `Hi ${name[0].toUpperCase()}${name.slice(1)},` : 'Hi there,';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Copy for each email: subject, preview line (shown after the subject in the
// inbox), paragraphs, an optional list, and the button.
function copyFor(step, { car, short, offer, range }) {
  const rangeNote = range
    ? 'Where you land in the range depends on the rims, the catalytic converter and how the car looks in person.'
    : null;
  return {
    1: {
      subject: `Your offer for the ${car}`,
      preview: `${offer} cash with free towing. Call or text to book a pickup.`,
      before: [`Thanks for getting an offer for your ${car} on scrappycar.ca. Here it is again.`],
      showOffer: true,
      after: [rangeNote, 'Ready to book? We can often pick up the same day.'],
      button: `Call ${PHONE}`,
      action: 'call',
    },
    2: {
      subject: `Still have the ${short}?`,
      preview: `Your ${offer} offer still stands. Here's how pickup works.`,
      before: [`Your offer of ${offer} for the ${car} still stands, as long as the car is as you described it.`],
      list: [
        'We pick a time that suits you, any day of the week.',
        'The tow is free and we bring the paperwork.',
        "Have your ownership handy and take your plates off. You're paid in cash when we load the car.",
      ],
      showOffer: false,
      after: ['Not sure about the paperwork or the price? We can sort it out on the phone in a couple of minutes.'],
      button: 'Book my pickup',
      action: 'call',
    },
    3: {
      subject: `Last note about your ${short}`,
      preview: "If it's still sitting there, we can usually pick it up within a day or two.",
      before: [`This is our last email about your ${car}. If you've sold it already, you don't need to reply.`],
      showOffer: false,
      after: [
        "If it's still sitting there, call or text and we'll confirm today's price and pick it up within a day or two.",
        'Got a higher offer somewhere else? Send us the number and we\'ll try to match it.',
      ],
      button: `Call ${PHONE}`,
      action: 'call',
    },
  }[step];
}

function renderText(c, { greeting, offer, car, unsub }) {
  return [
    greeting, '',
    ...c.before, '',
    ...(c.showOffer ? [`Your offer: ${offer} for the ${car}. Free towing, cash at pickup.`, ''] : []),
    ...(c.list ? [...c.list.map((l) => `- ${l}`), ''] : []),
    ...c.after.filter(Boolean).flatMap((p) => [p, '']),
    `Call or text ${PHONE}, or reply to this email.`, '',
    'Scrappy Car', '',
    '--',
    'Scrappy Car, 125 Island Rd, Scarborough, ON. scrappycar.ca',
    "You're getting this because you asked for an offer on scrappycar.ca.",
    `Stop these emails: ${unsub}`,
  ].join('\n');
}

// Table layout with inline styles, which is what email apps render reliably.
// No images: they're blocked by default and count against a new domain.
function renderHtml(c, { greeting, offer, car, unsub, buttonUrl, textUrl }) {
  const p = (t) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2328;">${esc(t)}</p>`;
  const offerBox = c.showOffer ? `
          <tr><td style="padding:4px 0 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1faf3;border:1px solid #cdebd4;border-radius:10px;">
              <tr><td style="padding:18px 20px;text-align:center;">
                <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1f7a33;">Your offer</div>
                <div style="font-size:34px;line-height:42px;font-weight:800;color:#111;padding:4px 0;">${esc(offer)}</div>
                <div style="font-size:14px;line-height:20px;color:#57606a;">${esc(car)} &middot; free towing &middot; cash at pickup</div>
              </td></tr>
            </table>
          </td></tr>` : '';
  const list = c.list ? `
          <tr><td style="padding:0 0 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0">
              ${c.list.map((l) => `<tr><td valign="top" style="padding:0 10px 10px 0;font-size:16px;line-height:24px;color:#27a83e;font-weight:800;">&#10003;</td><td style="padding:0 0 10px;font-size:16px;line-height:24px;color:#1f2328;">${esc(l)}</td></tr>`).join('')}
            </table>
          </td></tr>` : '';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eaecef;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#111;">Scrappy<span style="color:#27a83e;">Car</span></span>
      </td></tr>
      <tr><td style="padding:28px 28px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td>${p(greeting)}${c.before.map(p).join('')}</td></tr>${offerBox}${list}
          <tr><td>${c.after.filter(Boolean).map(p).join('')}</td></tr>
          <tr><td style="padding:4px 0 12px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:#39d353;">
              <a href="${esc(buttonUrl)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:800;color:#0f0f0f;text-decoration:none;border-radius:8px;">${esc(c.button)}</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="padding:0 0 24px;font-size:14px;line-height:22px;color:#57606a;">
            Prefer text? <a href="${esc(textUrl)}" style="color:#1f7a33;">Text ${esc(PHONE)}</a>, or just reply to this email.
          </td></tr>
          <tr><td style="padding:0 0 28px;font-size:16px;line-height:24px;color:#1f2328;">Scrappy Car</td></tr>
        </table>
      </td></tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:16px 28px;font-size:12px;line-height:18px;color:#6e7781;text-align:center;">
        Scrappy Car &middot; 125 Island Rd, Scarborough, ON &middot; <a href="${SITE}" style="color:#6e7781;">scrappycar.ca</a><br>
        You're getting this because you asked for an offer on scrappycar.ca. <a href="${esc(unsub)}" style="color:#6e7781;">Stop these emails</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderEmail({ step, dealId, firstName, year, make, model, low, high, ph }) {
  const car = [year, make, model].filter(Boolean).join(' ') || 'your car';
  const short = model || 'car';
  const offer = offerText(low, high);
  const c = copyFor(step, { car, short, offer, range: Number(high) > Number(low) });
  const ctx = {
    greeting: hello(firstName), offer, car, unsub: unsubscribeUrl(dealId),
    buttonUrl: goUrl(dealId, step, c.action, ph), textUrl: goUrl(dealId, step, 'text', ph),
  };
  return { subject: c.subject, preview: c.preview, text: renderText(c, ctx), html: renderHtml(c, ctx) };
}

module.exports = {
  SCHEDULE, MAX_DAYS, GO_TARGETS, daysSince, dueStep, sign, signedOk, verify, goPayload, unsubscribeUrl, renderEmail,
};

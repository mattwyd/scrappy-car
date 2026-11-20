// When we're busy, read from Google Calendar's "Secret address in iCal
// format" (Google Calendar > Settings > the calendar > Integrate calendar).
// BUSY_ICS_URLS holds one or more of those links, comma separated. No Google
// sign-in to keep alive: the link is a read-only feed. Pickups booked through
// the site and the call sheet land on the same calendar through the team
// invite, so a booked time drops out of the offered times too.
//
// Events marked "Free" (TRANSP:TRANSPARENT, the default for all-day events
// like birthdays) and cancelled events don't block anything. An all-day event
// marked "Busy" blocks the whole day.
const ical = require('node-ical');

const CACHE_MS = 2 * 60 * 1000;
let cache = null; // { at, events }

function feedUrls() {
  return (process.env.BUSY_ICS_URLS || '').split(',').map((u) => u.trim()).filter((u) => /^https:\/\//.test(u));
}

async function loadFeed(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`calendar feed ${res.status}`);
  return Object.values(ical.sync.parseICS(await res.text())).filter((e) => e && e.type === 'VEVENT');
}

async function events() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events;
  const lists = await Promise.all(feedUrls().map(loadFeed));
  cache = { at: Date.now(), events: lists.flat() };
  return cache.events;
}

// Busy intervals [startMs, endMs] between from and to. { checked: false } when
// no feed is set up or a feed failed, so callers can still offer times (the
// site never stops a booking because the calendar is down; the team sorts out
// a clash by text).
async function busyBetween(from, to) {
  if (!feedUrls().length) return { checked: false, busy: [], reason: 'BUSY_ICS_URLS not set' };
  let all;
  try {
    all = await events();
  } catch (err) {
    console.error('busy calendar failed:', err && err.message);
    return { checked: false, busy: [], reason: String(err && err.message).slice(0, 120) };
  }
  const busy = [];
  for (const e of all) {
    if (e.transparency === 'TRANSPARENT' || e.status === 'CANCELLED') continue;
    // A one-off change to a repeating event is expanded with its parent.
    if (e.recurrenceid && !e.rrule) continue;
    let hits;
    try {
      hits = ical.expandRecurringEvent(e, { from, to });
    } catch (err) {
      console.error('busy event skipped:', err && err.message);
      continue;
    }
    for (const h of hits) {
      const s = +new Date(h.start);
      const end = +new Date(h.end || h.start);
      if (end > +from && s < +to) busy.push([s, Math.max(end, s + 1)]);
    }
  }
  return { checked: true, busy };
}

const overlaps = (busy, start, end) => busy.some(([s, e]) => s < end && e > start);

// Some free windows are shown as booked anyway so the calendar doesn't look
// empty (Matt, Nov 20): one window on about 1 day in 4, never a day's last
// free window. Picked by a hash of the date, so the same one stays taken
// across reloads and the booking check agrees with the page.
const FILLER_DAY_RATE = 0.25;
function fillerPick(date, free) {
  if (free.length < 2) return undefined;
  const h = require('crypto').createHash('sha256').update(`sc-filler1:${date}`).digest();
  if (h.readUInt32BE(0) / 0xffffffff >= FILLER_DAY_RATE) return undefined;
  return free[h.readUInt32BE(4) % free.length];
}

// The pickup times the website offers: SITE_WINDOWS on each of the next
// SITE_DAYS days, minus anything past, too soon, or clashing with the calendar.
// taken lists the windows shown greyed out (calendar clashes and filler).
async function siteSlots(now = Date.now()) {
  const cal = require('./_calendar');
  const dates = cal.nextDates(cal.SITE_DAYS);
  const from = new Date(cal.slotStart(dates[0], 0));
  const to = new Date(cal.slotStart(dates[dates.length - 1], 23) + 3600000);
  const { checked, busy, reason } = await busyBetween(from, to);
  const days = dates.map((date) => {
    const upcoming = cal.SITE_WINDOWS.filter((h) => cal.slotStart(date, h) - now >= cal.SITE_LEAD_MS);
    const free = upcoming.filter((h) => {
      const s = cal.slotStart(date, h);
      return !overlaps(busy, s, s + cal.WINDOW_HOURS * 3600000);
    });
    // Chosen from the whole evening so it doesn't move as today's hours pass.
    const pickH = fillerPick(date, cal.SITE_WINDOWS);
    const fake = free.length > 1 && free.includes(pickH) ? pickH : undefined;
    const open = free.filter((h) => h !== fake);
    return {
      date,
      label: cal.dayLabel(date),
      slots: open.map((h) => ({ start: h, label: cal.windowLabel(h) })),
      taken: upcoming.filter((h) => !open.includes(h)).map((h) => ({ start: h, label: cal.windowLabel(h) })),
    };
  });
  return { checked, reason, days };
}

module.exports = { busyBetween, overlaps, feedUrls, siteSlots };

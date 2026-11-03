// Pickup bookings on the "Scrappy Car pickups" Google Calendar, used by the call
// sheet (api/call.js). One-time setup: scripts/google-calendar-setup.mjs signs in
// as the calendar owner and saves GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN and GOOGLE_CALENDAR_ID to Vercel. Until those are set a
// booking still saves to Airtable and the alert says it isn't on the calendar.
const TZ = 'America/Toronto';
const WINDOW_HOURS = 2;
const WINDOWS = [8, 10, 12, 14, 16, 18]; // start hours: 8am to 8pm in 2-hour windows

function calendarConfigured() {
  const e = process.env;
  return !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REFRESH_TOKEN && e.GOOGLE_CALENDAR_ID);
}

let cached = null;

async function accessToken() {
  if (cached && cached.expires > Date.now() + 60 * 1000) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await res.json().catch(() => ({}));
  // invalid_grant means the sign-in was revoked or expired: rerun the setup script.
  if (!res.ok) throw new Error(`google sign-in ${res.status}: ${body.error || 'error'}`);
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in || 3600) * 1000 };
  return cached.token;
}

async function gcal(path, options = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(process.env.GOOGLE_CALENDAR_ID)}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`google calendar ${res.status}: ${(body && body.error && body.error.message) || text.slice(0, 200)}`);
  return body;
}

const pad = (n) => String(n).padStart(2, '0');

// Toronto's UTC offset on a date, like "-05:00". Noon is past any DST switch.
function torontoOffset(date) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName');
  const offset = part ? part.value.replace('GMT', '') : '';
  return offset || '+00:00';
}

function torontoHour(iso) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
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

// What's already booked that day, by window start hour: { 10: ['Pickup: ...'] }.
async function bookingsOn(date) {
  const q = new URLSearchParams({
    timeMin: `${date}T00:00:00${torontoOffset(date)}`,
    timeMax: `${date}T23:59:59${torontoOffset(date)}`,
    singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
  });
  const { items = [] } = await gcal(`/events?${q}`);
  const out = {};
  items.forEach((ev) => {
    if (ev.status === 'cancelled' || !ev.start || !ev.start.dateTime) return;
    const h = torontoHour(ev.start.dateTime);
    const w = WINDOWS.find((s) => h >= s && h < s + WINDOW_HOURS);
    if (w != null) (out[w] = out[w] || []).push(ev.summary || 'Busy');
  });
  return out;
}

// Guests see the title, location and description, so keep internal notes out.
async function createPickup({ date, start, summary, location, description, email }) {
  const ev = await gcal(`/events?sendUpdates=${email ? 'all' : 'none'}`, {
    method: 'POST',
    body: JSON.stringify({
      summary, location, description,
      start: { dateTime: `${date}T${pad(start)}:00:00`, timeZone: TZ },
      end: { dateTime: `${date}T${pad(start + WINDOW_HOURS)}:00:00`, timeZone: TZ },
      attendees: email ? [{ email }] : undefined,
      guestsCanInviteOthers: false,
      guestsCanModify: false,
    }),
  });
  return { id: ev.id, link: ev.htmlLink };
}

module.exports = {
  WINDOWS, calendarConfigured, bookingsOn, createPickup, validSlot, windowLabel, dayLabel, torontoToday,
};

#!/usr/bin/env node
// One-time Google Calendar setup for the call sheet (/call) pickup bookings.
//
// 1. In Google Cloud console, signed in as the account that will own the
//    calendar: create a project, enable "Google Calendar API", set up the OAuth
//    consent screen (External; set publishing status to "In production" or the
//    sign-in expires after 7 days), and create an OAuth client of type
//    "Desktop app".
// 2. From the repo root (it must be `vercel link`ed):
//      GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-calendar-setup.mjs --share sean@example.com
//    It opens a Google sign-in, creates a "Scrappy Car pickups" calendar
//    (or uses GOOGLE_CALENDAR_ID if set), shares it, and saves the four
//    GOOGLE_* values to Vercel production. Secrets go to Vercel through stdin
//    and are never printed.
// 3. Redeploy so /call picks them up.
//
// The scope only reaches calendars this app creates, not the rest of the account.
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
const shareArg = process.argv.indexOf('--share');
const share = shareArg > 0 ? (process.argv[shareArg + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first (see the top of this file).');
  process.exit(1);
}

const server = http.createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const redirect = `http://127.0.0.1:${server.address().port}`;
const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
  access_type: 'offline', prompt: 'consent',
});

console.log('Opening Google sign-in. Sign in as the account that should own the pickups calendar.');
console.log(`If no browser opens, go to:\n${authUrl}\n`);
spawnSync('open', [authUrl]);

const code = await new Promise((resolve, reject) => {
  server.on('request', (req, res) => {
    const u = new URL(req.url, redirect);
    const got = u.searchParams.get('code');
    const error = u.searchParams.get('error');
    if (!got && !error) { res.statusCode = 404; return res.end(); }
    res.end(got ? 'Signed in. You can close this tab and go back to the terminal.' : `Sign-in failed: ${error}`);
    if (got) resolve(got); else reject(new Error(error));
  });
});
server.close();

const tokens = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }),
}).then((r) => r.json());
if (!tokens.refresh_token) {
  console.error(`No refresh token from Google (${tokens.error || 'unknown error'}). Try again.`);
  process.exit(1);
}

async function gcal(path, body) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${r.status} ${(out.error && out.error.message) || ''}`);
  return out;
}

let calendarId = process.env.GOOGLE_CALENDAR_ID;
if (!calendarId) {
  const cal = await gcal('/calendars', { summary: 'Scrappy Car pickups', timeZone: 'America/Toronto' });
  calendarId = cal.id;
  console.log(`Created the "Scrappy Car pickups" calendar.`);
}
for (const email of share) {
  try {
    await gcal(`/calendars/${encodeURIComponent(calendarId)}/acl?sendNotifications=true`, { role: 'writer', scope: { type: 'user', value: email } });
    console.log(`Shared it with ${email} (can edit).`);
  } catch (err) {
    console.log(`Couldn't share with ${email} (${err.message}). Share it in Google Calendar: settings for "Scrappy Car pickups" > Share with specific people.`);
  }
}

const values = {
  GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret,
  GOOGLE_REFRESH_TOKEN: tokens.refresh_token, GOOGLE_CALENDAR_ID: calendarId,
};
for (const [name, value] of Object.entries(values)) {
  spawnSync('vercel', ['env', 'rm', name, 'production', '--yes'], { cwd: ROOT, stdio: 'ignore' });
  const r = spawnSync('vercel', ['env', 'add', name, 'production'], { cwd: ROOT, input: value, stdio: ['pipe', 'ignore', 'pipe'] });
  console.log(r.status === 0 ? `Saved ${name} to Vercel production.` : `Couldn't save ${name}: ${String(r.stderr).trim()}`);
}
console.log('\nDone. Redeploy (push to main) so /call can book pickups.');

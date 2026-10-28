const { hubspot, notify } = require('./_lib');
const { verify } = require('./_followups');

// The "Stop these emails" link in follow-up emails. Opening the link only shows
// a button, because mail scanners open links on their own; the button (or a
// mail app's one-click unsubscribe) POSTs back here to stop the emails.

function page(res, status, title, body) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><title>${title} | Scrappy Car</title>
<style>
  body { background: #0f0f0f; color: #e8e8e8; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; line-height: 1.6; margin: 0; }
  main { max-width: 480px; margin: 0 auto; padding: 4rem 1.25rem; text-align: center; }
  h1 { color: #fff; font-size: 1.6rem; margin: 0 0 .75rem; }
  p { color: #8a8a8a; }
  a { color: #39d353; }
  button { background: #39d353; color: #000; font: inherit; font-weight: 800; border: 0; border-radius: 8px; padding: .8rem 1.6rem; cursor: pointer; margin-top: 1rem; }
</style></head>
<body><main><h1>${title}</h1>${body}</main></body></html>`);
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const id = String(q.d || '');
  if (!/^\d+$/.test(id) || !verify(id, String(q.s || ''))) {
    return page(res, 400, "That link didn't work",
      '<p>To stop our emails, reply to one with "stop" or call <a href="tel:6472044200">(647) 204-4200</a>.</p>');
  }

  if (req.method !== 'POST') {
    return page(res, 200, 'Stop follow-up emails?',
      '<p>We\'ll stop emailing you about your offer.</p><form method="post"><button type="submit">Stop emails</button></form>');
  }

  try {
    await hubspot(`/crm/v3/objects/deals/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { sc_followups_stopped: 'true' } }),
    });
  } catch (err) {
    // The request still has to be honoured, so the owners stop it by hand.
    console.error('unsubscribe failed', id, err && err.message);
    await notify([
      `⚠️ UNSUBSCRIBE NOT SAVED (deal ${id})`,
      'Tick "Unsubscribed from follow-ups" on this deal in HubSpot so the follow-up emails stop.',
      process.env.HUBSPOT_PORTAL_ID ? `https://app.hubspot.com/contacts/${process.env.HUBSPOT_PORTAL_ID}/record/0-3/${id}` : null,
    ]).catch(() => {});
  }
  return page(res, 200, "You're unsubscribed",
    '<p>We won\'t send you any more follow-up emails. Still want to sell? Call or text <a href="tel:6472044200">(647) 204-4200</a>.</p>');
};

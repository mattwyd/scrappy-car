const { capture } = require('./_lib');
const { GO_TARGETS, goPayload, signedOk } = require('./_followups');

// Buttons in follow-up emails land here: count the tap in PostHog, then open
// the phone or messages app. It answers with a page rather than a redirect
// because some mail apps' browsers won't follow a redirect to tel: or sms:.
// A link that fails the signature check still opens the phone, uncounted.

module.exports = async (req, res) => {
  const q = req.query || {};
  const d = String(q.d || '');
  const n = String(q.n || '');
  const a = String(q.a || '');
  const ph = q.p ? String(q.p) : '';
  const target = GO_TARGETS[a] || GO_TARGETS.call;
  const counted = /^\d+$/.test(d) && /^[1-3]$/.test(n) && GO_TARGETS[a] && signedOk(goPayload(d, n, a, ph), String(q.s || ''));
  if (counted) await capture('followup_clicked', ph || `deal-${d}`, { deal_id: d, step: Number(n), action: a });

  const label = a === 'text' ? 'Text (647) 204-4200' : 'Call (647) 204-4200';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${target}"><title>Scrappy Car</title>
<style>
  body { background: #0f0f0f; color: #e8e8e8; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; }
  main { max-width: 420px; margin: 0 auto; padding: 4rem 1.25rem; text-align: center; }
  a.btn { display: inline-block; background: #39d353; color: #000; font-weight: 800; text-decoration: none; border-radius: 8px; padding: .9rem 1.8rem; }
  p { color: #8a8a8a; }
</style></head>
<body><main><h1>Scrappy Car</h1><p>Opening your phone app...</p><a class="btn" href="${target}">${label}</a>
<p>Or reply to our email and we'll get back to you.</p></main></body></html>`);
};

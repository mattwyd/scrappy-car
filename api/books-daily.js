const { notify } = require('./_lib');
const { booksKey, torontoDate, previousMonth, reconcile, issues, pnl, reportLines } = require('./_books');

// Daily cron (vercel.json). On the 1st it sends last month's P&L to the
// owners. Every day it gives each accepted lead a P&L row (reconcile). On
// Mondays it lists picked-up deals missing prices and bookings past their day.
//
// ?run=report or ?run=missing forces one; ?dry=1 returns it without sending.

const SITE = process.env.SITE_URL || 'https://scrappycar.ca';

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.AIRTABLE_TOKEN) return res.status(200).json({ skipped: 'AIRTABLE_TOKEN missing' });

  const q = req.query || {};
  const dry = q.dry === '1';
  const today = torontoDate(Date.now());
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const link = `${SITE}/books#k=${booksKey()}`;
  const out = { today };

  try {
    out.reconciled = dry ? 'skipped (dry run)' : await reconcile();
    if (q.run === 'report' || (!q.run && today.endsWith('-01'))) {
      const r = await pnl(previousMonth(today.slice(0, 7)));
      out.report = reportLines(r, link);
      if (!dry) await notify(out.report);
    }
    if (q.run === 'missing' || (!q.run && weekday === 1)) {
      const missing = await issues();
      out.missing = missing;
      if (missing.length && !dry) {
        await notify([
          `🧾 ${missing.length} deal(s) need something in Airtable`,
          '',
          ...missing.map((m) => `${m.name}: ${m.missing.join(', ')}`),
          '',
          `Books: ${link}`,
        ]);
      }
    }
  } catch (err) {
    console.error('books daily failed:', err && err.message);
    return res.status(500).json({ ...out, error: String(err && err.message).slice(0, 200) });
  }
  return res.status(200).json(out);
};

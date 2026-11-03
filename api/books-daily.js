const { notify } = require('./_lib');
const { booksKey, torontoDate, previousMonth, closedRecords, missingPrices, pnl, reportLines } = require('./_books');

// Daily cron (vercel.json). On the 1st it sends last month's P&L to the
// owners. On Mondays it lists closed Airtable P&L rows still missing their prices.
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
    if (q.run === 'report' || (!q.run && today.endsWith('-01'))) {
      const r = await pnl(previousMonth(today.slice(0, 7)));
      out.report = reportLines(r, link);
      if (!dry) await notify(out.report);
    }
    if (q.run === 'missing' || (!q.run && weekday === 1)) {
      const missing = missingPrices(await closedRecords());
      out.missing = missing;
      if (missing.length && !dry) {
        await notify([
          `🧾 ${missing.length} Airtable P&L row(s) need prices`,
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

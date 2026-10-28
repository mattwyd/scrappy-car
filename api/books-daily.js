const { pipeline, notify } = require('./_lib');
const { booksKey, torontoDate, previousMonth, searchDeals, missingPrices, pnl, reportLines } = require('./_books');

// Daily cron (vercel.json). On the 1st it sends last month's P&L to the
// owners. On Mondays it lists picked-up deals still missing their prices,
// since HubSpot's free plan can't make those fields required.
//
// ?run=report or ?run=missing forces one; ?dry=1 returns it without sending.

const SITE = process.env.SITE_URL || 'https://scrappycar.ca';

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.HUBSPOT_TOKEN) return res.status(200).json({ skipped: 'HUBSPOT_TOKEN missing' });

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
      const p = await pipeline();
      const picked = await searchDeals([
        { propertyName: 'pipeline', operator: 'EQ', value: p.id },
        { propertyName: 'dealstage', operator: 'EQ', value: p.pickedUp },
      ]);
      const missing = missingPrices(picked);
      out.missing = missing;
      if (missing.length && !dry) {
        await notify([
          `🧾 ${missing.length} picked-up deal(s) need prices for the P&L`,
          '',
          ...missing.map((m) => `${m.name}: ${m.missing.join(', ')}${m.url ? `\n${m.url}` : ''}`),
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

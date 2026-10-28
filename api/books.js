const { readBody } = require('./_lib');
const {
  CATEGORIES, keyOk, torontoDate, money, addExpense, removeExpense, setAdSpend, pnl,
} = require('./_books');

// Backs the private Books page (/books) and the Google Ads spend script.
// Every call needs the books key in the X-Books-Key header.
//
//   GET  ?month=YYYY-MM                     -> that month's P&L
//   POST { type: 'expense', date, category, amount, note }
//   POST { type: 'delete', id }             -> removes one expense
//   POST { type: 'ad_spend', days: [{ date, cost }] }   (from Google Ads)

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!keyOk(req.headers['x-books-key'])) return res.status(401).json({ error: 'bad key' });

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : torontoDate(Date.now()).slice(0, 7);
      return res.status(200).json({ categories: CATEGORIES, ...(await pnl(month)) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    const body = readBody(req);
    if (body.type === 'expense') {
      const amount = money(body.amount);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      if (!CATEGORIES.includes(body.category)) return res.status(400).json({ error: 'unknown category' });
      if (!(amount > 0 && amount < 100000)) return res.status(400).json({ error: 'amount must be more than 0' });
      return res.status(200).json({ expense: await addExpense({ date: body.date, category: body.category, amount, note: body.note }) });
    }
    if (body.type === 'delete') {
      await removeExpense(body.id);
      return res.status(200).json({ ok: true });
    }
    if (body.type === 'ad_spend') {
      const days = Array.isArray(body.days) ? body.days.slice(0, 60) : [];
      return res.status(200).json({ saved: await setAdSpend(days) });
    }
    return res.status(400).json({ error: 'unknown request' });
  } catch (err) {
    console.error('books failed:', err && err.message);
    return res.status(500).json({ error: String(err && err.message).slice(0, 200) });
  }
};

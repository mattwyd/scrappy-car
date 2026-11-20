// Free pickup times for the offer screen: GET -> { days: [{ date, label, slots: [{ start, label }] }] }.
// Only after-work windows that don't clash with the team calendar (api/_busy.js).
const { siteSlots } = require('./_busy');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { days } = await siteSlots();
    return res.status(200).json({ days });
  } catch (err) {
    console.error('slots failed:', err && err.message);
    return res.status(500).json({ error: 'could not load times' });
  }
};

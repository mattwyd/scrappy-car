const { put } = require('@vercel/blob');
const { throttled } = require('./_lib');

const MAX_BYTES = 3 * 1024 * 1024;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (throttled(req, 12, 60 * 1000)) return res.status(429).json({ error: 'slow down' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const data = typeof body.data === 'string' ? body.data.replace(/^data:image\/\w+;base64,/, '') : null;
  if (!data) return res.status(400).json({ error: 'no image' });

  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return res.status(413).json({ error: 'image too large' });

  // Without a magic-byte check this endpoint will host any file anyone posts to it.
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  if (!isJpeg && !isPng) return res.status(400).json({ error: 'not an image' });

  try {
    const blob = await put(`scrappycar-photos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });
    return res.status(200).json({ url: blob.url });
  } catch (err) {
    console.error('photo upload failed', err && err.message);
    return res.status(500).json({ error: 'upload failed' });
  }
};

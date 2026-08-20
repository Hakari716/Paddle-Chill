import { createAdminToken } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const { password } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const expectedPassword = process.env.ADMIN_PASSWORD || '';

    if (!expectedPassword) {
      return res.status(500).json({
        ok: false,
        message: 'ADMIN_PASSWORD is not configured in Vercel environment variables.'
      });
    }

    if (!password || password !== expectedPassword) {
      return res.status(401).json({ ok: false, message: 'Incorrect admin password.' });
    }

    const token = createAdminToken();
    return res.status(200).json({ ok: true, message: 'Admin authenticated.', token });
  } catch (error) {
    console.error('Admin login request failed:', error);
    return res.status(500).json({ ok: false, message: 'Admin login failed.' });
  }
}

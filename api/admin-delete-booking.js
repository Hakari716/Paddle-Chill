import { verifyAdminToken } from './_auth.js';
import { supabaseServiceRequest } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const { id, token } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ ok: false, message: 'Admin session expired. Please log in again.' });
    }

    if (!id) {
      return res.status(400).json({ ok: false, message: 'Booking id is required.' });
    }

    const removed = await supabaseServiceRequest(`bookings?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    return res.status(200).json({ ok: true, removed: Array.isArray(removed) ? removed.length : 0 });
  } catch (error) {
    console.error('Admin delete booking failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not remove booking.' });
  }
}

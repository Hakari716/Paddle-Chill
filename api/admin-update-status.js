import { verifyAdminToken } from './_auth.js';
import { supabaseServiceRequest } from './_supabase.js';

const ALLOWED_STATUSES = new Set(['Pending', 'Confirmed']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const { id, status, token } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ ok: false, message: 'Admin session expired. Please log in again.' });
    }

    if (!id) {
      return res.status(400).json({ ok: false, message: 'Booking id is required.' });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return res.status(400).json({ ok: false, message: 'Invalid status value.' });
    }

    const updated = await supabaseServiceRequest(`bookings?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    return res.status(200).json({ ok: true, updated: Array.isArray(updated) ? updated.length : 0 });
  } catch (error) {
    console.error('Admin update booking status failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not update booking.' });
  }
}

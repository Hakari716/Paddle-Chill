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

    const targetId = String(id || '').trim();
    if (!targetId) {
      return res.status(400).json({ ok: false, message: 'Booking id is required.' });
    }

    // Only allow permanent deletion of bookings already soft-deleted (in the bin), as a safety guard.
    const existing = await supabaseServiceRequest(`bookings?id=eq.${encodeURIComponent(targetId)}&select=id,status`, {
      method: 'GET'
    });

    if (!Array.isArray(existing) || !existing.length) {
      return res.status(404).json({ ok: false, message: 'Booking not found.' });
    }

    if (existing[0].status !== 'Cancelled') {
      return res.status(400).json({ ok: false, message: 'Only bookings already moved to the bin can be permanently deleted.' });
    }

    const deleted = await supabaseServiceRequest(`bookings?id=eq.${encodeURIComponent(targetId)}`, {
      method: 'DELETE'
    });

    return res.status(200).json({ ok: true, deleted: Array.isArray(deleted) ? deleted.length : 0, deletedId: targetId });
  } catch (error) {
    console.error('Admin permanent delete failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not permanently delete booking.' });
  }
}

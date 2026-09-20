import { supabaseServiceRequest } from './_supabase.js';

function normalizeDateValue(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const isoCandidate = raw.includes('T') ? raw.split('T')[0] : raw;
  const match = isoCandidate.match(/^\d{4}-\d{2}-\d{2}$/);
  if (match) return isoCandidate;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const rows = await supabaseServiceRequest('bookings?select=*', {
      method: 'GET'
    });

    const visibleRows = Array.isArray(rows)
      ? rows.filter((row) => !(row.status === 'Cancelled' || row.is_deleted || row.deleted || row.deleted_at))
      : [];

    const normalized = visibleRows.map((row) => ({
      id: row.id,
      court: row.court,
      date: normalizeDateValue(row.booking_date || row.date),
      time: row.time || '',
      hourStart: row.start_hour ?? row.hourStart,
      hourEnd: row.end_hour ?? row.hourEnd,
      duration: row.duration || 1,
      payment: row.payment_method || row.payment || 'GCash',
      amount: Number(row.amount ?? row.total ?? 0),
      status: row.status || 'Pending',
      createdAt: row.created_at || row.createdAt || new Date().toISOString()
    }));

    return res.status(200).json(normalized);
  } catch (error) {
    console.error('Booking fetch failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not load bookings.' });
  }
}

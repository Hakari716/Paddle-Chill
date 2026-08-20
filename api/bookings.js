import { supabaseServiceRequest } from './_supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const rows = await supabaseServiceRequest('bookings?select=*', {
      method: 'GET'
    });

    const normalized = Array.isArray(rows) ? rows.map((row) => ({
      id: row.id,
      name: row.customer_name || row.name || '',
      phone: row.phone || '',
      court: row.court,
      date: row.booking_date || row.date,
      time: row.time || '',
      hourStart: row.start_hour ?? row.hourStart,
      hourEnd: row.end_hour ?? row.hourEnd,
      duration: row.duration || 1,
      payment: row.payment_method || row.payment || 'Cash on arrival',
      paymentProof: row.payment_proof_url || row.paymentProof || '',
      paymentProofName: row.payment_proof_name || row.paymentProofName || '',
      amount: Number(row.amount ?? row.total ?? 0),
      status: row.status || 'Pending',
      createdAt: row.created_at || row.createdAt || new Date().toISOString()
    })) : [];

    return res.status(200).json(normalized);
  } catch (error) {
    console.error('Booking fetch failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not load bookings.' });
  }
}

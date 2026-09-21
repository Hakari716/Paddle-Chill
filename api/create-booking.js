import { supabaseServiceRequest } from './_supabase.js';

function normalizeDateValue(value) {
  if (!value && value !== 0) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const isoCandidate = raw.includes('T') ? raw.split('T')[0] : raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoCandidate)) return isoCandidate;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      id, name, phone, court, date, time,
      hourStart, hourEnd, duration, payment, amount,
      paymentProof, paymentProofName, createdAt
    } = body;

    const bookingDate = normalizeDateValue(date);
    const start = Number(hourStart);
    const end = Number(hourEnd);

    if (!id || !name || !phone || !court || !bookingDate || !time || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return res.status(400).json({ ok: false, message: 'Missing or invalid booking details.' });
    }

    // Check for overlapping, still-active bookings on the same court/date before inserting,
    // to close the race window that let two customers double-book the same slot.
    const existingRows = await supabaseServiceRequest(
      `bookings?select=id,start_hour,end_hour,status&court=eq.${encodeURIComponent(court)}&booking_date=eq.${encodeURIComponent(bookingDate)}`,
      { method: 'GET' }
    );

    const conflict = (Array.isArray(existingRows) ? existingRows : []).some((row) => {
      if (String(row.status || '').trim() === 'Cancelled') return false;
      const rowStart = Number(row.start_hour);
      const rowEnd = Number(row.end_hour);
      return start < rowEnd && end > rowStart;
    });

    if (conflict) {
      return res.status(409).json({ ok: false, message: 'That court and time was just booked by someone else. Please choose another slot.' });
    }

    const payload = {
      id,
      customer_name: name,
      phone,
      court,
      booking_date: bookingDate,
      time,
      start_hour: start,
      end_hour: end,
      duration: Number(duration) || (end - start),
      payment_method: payment || 'GCash',
      status: 'Confirmed',
      amount: Number(amount) || 0,
      payment_proof_url: paymentProof || null,
      payment_proof_name: paymentProofName || null,
      created_at: createdAt || new Date().toISOString()
    };

    const inserted = await supabaseServiceRequest('bookings', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return res.status(200).json({ ok: true, booking: Array.isArray(inserted) ? inserted[0] : inserted });
  } catch (error) {
    console.error('Create booking failed:', error);
    return res.status(500).json({ ok: false, message: error.message || 'Could not save booking.' });
  }
}

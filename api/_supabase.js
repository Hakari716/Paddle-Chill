const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pkmymaxxbqacotuxiftk.supabase.co';

export async function supabaseServiceRequest(path, options = {}) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured in the server environment.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = (data && (data.message || data.error)) || `Supabase request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

import crypto from 'crypto';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PASSWORD || '';
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function createAdminToken() {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const payload = String(expiresAt);
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

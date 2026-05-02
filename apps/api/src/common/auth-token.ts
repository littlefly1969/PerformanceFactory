import { createHmac, timingSafeEqual } from 'crypto';
import { UserRole } from '@prisma/client';

type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  email: string;
  typ: 'access';
  iat: number;
  exp: number;
};

const TOKEN_TTL_SECONDS = 60 * 30;

const base64Url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const decodeBase64Url = (input: string) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
};

const getSecret = () => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('ACCESS_TOKEN_SECRET or SESSION_SECRET is required in production');
  }
  return secret ?? 'dev-access-token-secret';
};

const signatureFor = (header: string, payload: string) =>
  base64Url(createHmac('sha256', getSecret()).update(`${header}.${payload}`).digest());

export function signAccessToken(user: { id: string; role: UserRole; email: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      sub: user.id,
      role: user.role,
      email: user.email,
      typ: 'access',
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    } satisfies AccessTokenPayload),
  );
  return {
    accessToken: `${header}.${payload}.${signatureFor(header, payload)}`,
    expiresIn: TOKEN_TTL_SECONDS,
  };
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expected = signatureFor(header, payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as AccessTokenPayload;
    if (parsed.typ !== 'access' || !parsed.sub || !parsed.exp) {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

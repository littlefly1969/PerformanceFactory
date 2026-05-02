export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api';

const TOKEN_KEY = 'pf.accessToken';
const networkErrorResponse = () =>
  new Response(
    JSON.stringify({
      message: 'API non raggiungibile. Verifica che il server API sia avviato.',
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    },
  );

export function storeAccessToken(token?: string) {
  if (typeof window === 'undefined' || !token) {
    return;
  }
  window.sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage.getItem(TOKEN_KEY);
}

async function refreshAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/token`, {
      credentials: 'include',
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { accessToken?: string };
  if (data.accessToken) {
    storeAccessToken(data.accessToken);
  }
  return data.accessToken ?? null;
}

export function authHeaders(headers?: HeadersInit, tokenOverride?: string | null) {
  const next = new Headers(headers);
  const token = tokenOverride ?? getAccessToken();
  if (token && !next.has('Authorization')) {
    next.set('Authorization', `Bearer ${token}`);
  }
  return next;
}

export async function secureFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const url = String(input);
  const method = init.method?.toUpperCase() ?? 'GET';
  const needsBearer = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const token =
    getAccessToken() ||
    (needsBearer && !url.includes('/auth/login') && !url.includes('/auth/token')
      ? await refreshAccessToken()
      : null);

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      credentials: 'include',
      headers: authHeaders(init.headers, token),
    });
  } catch {
    return networkErrorResponse();
  }

  if (
    needsBearer &&
    (response.status === 401 || response.status === 403) &&
    !url.includes('/auth/login') &&
    !url.includes('/auth/token')
  ) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken && refreshedToken !== token) {
      try {
        return await fetch(input, {
          ...init,
          credentials: 'include',
          headers: authHeaders(init.headers, refreshedToken),
        });
      } catch {
        return networkErrorResponse();
      }
    }
  }

  return response;
}

export async function redirectIfOnboardingRequired() {
  const response = await secureFetch(`${API_BASE}/auth/me`);
  if (!response.ok) {
    window.location.href = '/login';
    return true;
  }
  const me = (await response.json()) as { role?: string; onboardingRequired?: boolean };
  if (me.role === 'USER' && me.onboardingRequired) {
    window.location.href = '/onboarding';
    return true;
  }
  return false;
}

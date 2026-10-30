import { afterEach, expect, it, vi } from 'vitest';
import { PasskeyCancelled, loginWithPasskey } from './passkey';

vi.mock('./api', () => ({ API_BASE: '/api', secureFetch: vi.fn() }));
const browser = vi.hoisted(() => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  browserSupportsWebAuthnAutofill: vi.fn(async () => true),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));
vi.mock('@simplewebauthn/browser', () => browser);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('lets a click during a slow autofill preparation keep its Face ID', async () => {
  const pending: Array<(response: Response) => void> = [];
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      if (url.endsWith('/login/verify'))
        return Promise.resolve(Response.json({ accessToken: 'tok' }));
      return new Promise<Response>((resolve) => pending.push(resolve));
    }),
  );
  browser.startAuthentication.mockResolvedValue({ id: 'cred-1' });

  const autofill = loginWithPasskey(true);
  const autofillResult = autofill.catch((error: unknown) => error);
  await vi.waitFor(() => expect(pending).toHaveLength(1));
  const click = loginWithPasskey();
  await Promise.resolve();
  // Il click aspetta: il server terrà il challenge dell'ultima richiesta.
  expect(urls).toHaveLength(1);

  pending[0](Response.json({ challenge: 'autofill' }));
  expect(await autofillResult).toBeInstanceOf(PasskeyCancelled);
  await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1](Response.json({ challenge: 'click' }));

  await expect(click).resolves.toEqual({ accessToken: 'tok' });
  expect(browser.startAuthentication).toHaveBeenCalledTimes(1);
  expect(browser.startAuthentication).toHaveBeenCalledWith({
    optionsJSON: { challenge: 'click' },
    useBrowserAutofill: false,
  });
});

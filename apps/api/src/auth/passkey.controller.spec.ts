import { UnauthorizedException } from '@nestjs/common';
import { PasskeyController } from './passkey.controller';
import type { AuthService } from './auth.service';
import type { PasskeyService } from './passkey.service';

type FakeSession = {
  id: string;
  userId?: string;
  passkeyChallenge?: unknown;
  save: jest.Mock;
  regenerate: jest.Mock;
};

function makeRequest() {
  const raw: { session?: FakeSession } = {};
  const session = (id: string): FakeSession => ({
    id,
    save: jest.fn((cb: (error?: unknown) => void) => cb()),
    regenerate: jest.fn((cb: (error?: unknown) => void) => {
      raw.session = session(`${id}-fresh`);
      cb();
    }),
  });
  raw.session = session('old');
  return { raw };
}

describe('PasskeyController login', () => {
  const user = { id: 'user-1', email: 'a@example.com', role: 'USER' };
  const passkeys = {
    verifyAuthentication: jest.fn(),
  } as unknown as jest.Mocked<PasskeyService>;
  const auth = {
    createApplicationSession: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;
  const controller = new PasskeyController(passkeys, auth);

  beforeEach(() => jest.clearAllMocks());

  it('opens a fresh session for the passkey owner', async () => {
    passkeys.verifyAuthentication.mockResolvedValue(user as never);
    auth.createApplicationSession.mockResolvedValue({
      ...user,
      accessToken: 'token',
    } as never);
    const req = makeRequest();
    const old = req.raw.session!;

    const result = await controller.verifyAuthentication(req as never, {
      response: { id: 'cred-1' },
    });

    expect(old.regenerate).toHaveBeenCalled();
    expect(req.raw.session!.id).toBe('old-fresh');
    expect(auth.createApplicationSession).toHaveBeenCalledWith(req, user);
    expect(req.raw.session!.save).toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ accessToken: 'token' }));
  });

  it('saves the consumed challenge when the passkey is refused', async () => {
    passkeys.verifyAuthentication.mockRejectedValue(
      new UnauthorizedException('no'),
    );
    const req = makeRequest();
    const old = req.raw.session!;

    await expect(
      controller.verifyAuthentication(req as never, { response: {} }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(old.save).toHaveBeenCalled();
    expect(old.regenerate).not.toHaveBeenCalled();
    expect(auth.createApplicationSession).not.toHaveBeenCalled();
  });
});

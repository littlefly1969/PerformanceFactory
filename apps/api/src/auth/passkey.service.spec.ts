import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as webauthn from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import {
  PasskeyService,
  PasskeySession,
  passkeyConfig,
  passkeyDeviceName,
} from './passkey.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

const mocked = webauthn as jest.Mocked<typeof webauthn>;

const user = {
  id: 'user-1',
  email: 'atleta@example.com',
  password: 'hash',
  role: 'USER',
  firstName: 'Mario',
  lastName: 'Rossi',
  isActive: true,
  createdAt: new Date(),
  onboardingAssessment: null as { status: string } | null,
};

const storedPasskey = {
  id: 'pk-1',
  userId: 'user-1',
  credentialId: 'cred-1',
  publicKey: Buffer.from([1, 2, 3]),
  counter: BigInt(4),
  transports: ['internal'],
  user,
};

function makePrisma() {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue({ ...user, passkeys: [] }),
    },
    passkey: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'pk-new', name: 'iPhone' }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('PasskeyService', () => {
  const env = process.env.WEB_ORIGIN;
  let prisma: ReturnType<typeof makePrisma>;
  let service: PasskeyService;

  beforeEach(() => {
    process.env.WEB_ORIGIN = 'https://pf.example.com';
    jest.resetAllMocks();
    prisma = makePrisma();
    service = new PasskeyService(prisma as unknown as PrismaService);
  });

  afterAll(() => {
    process.env.WEB_ORIGIN = env;
  });

  it('derives the relying party from WEB_ORIGIN', () => {
    expect(
      passkeyConfig({
        WEB_ORIGIN: 'https://pf.example.com/, http://localhost:3000',
      }),
    ).toEqual({
      rpID: 'pf.example.com',
      origins: ['https://pf.example.com', 'http://localhost:3000'],
    });
    expect(
      passkeyConfig({
        WEB_ORIGIN: 'https://app.pf.example.com',
        WEBAUTHN_RP_ID: 'pf.example.com',
      }).rpID,
    ).toBe('pf.example.com');
  });

  it('names the device from the user agent', () => {
    expect(
      passkeyDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac)'),
    ).toBe('iPhone');
    expect(passkeyDeviceName('Mozilla/5.0 (Linux; Android 15)')).toBe(
      'Android',
    );
    expect(passkeyDeviceName(undefined)).toBe('Dispositivo');
  });

  it('registers a passkey bound to the stored challenge', async () => {
    mocked.generateRegistrationOptions.mockResolvedValue({
      challenge: 'reg-challenge',
    } as never);
    mocked.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'cred-new',
          publicKey: new Uint8Array([9]),
          counter: 0,
          transports: ['internal', 'hybrid'],
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    } as never);
    prisma.passkey.findUnique.mockResolvedValue(null);
    const session: PasskeySession = {};

    await service.registrationOptions('user-1', session);
    expect(mocked.generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'pf.example.com',
        userName: 'atleta@example.com',
        userDisplayName: 'Mario Rossi',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'required',
        },
      }),
    );
    await service.verifyRegistration(
      'user-1',
      session,
      { id: 'cred-new' } as RegistrationResponseJSON,
      'Mozilla/5.0 (iPhone)',
    );

    expect(mocked.verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'reg-challenge',
        expectedOrigin: ['https://pf.example.com'],
        expectedRPID: 'pf.example.com',
        requireUserVerification: true,
      }),
    );
    expect(prisma.passkey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          credentialId: 'cred-new',
          transports: ['internal', 'hybrid'],
          deviceType: 'multiDevice',
          backedUp: true,
          name: 'iPhone',
        }),
      }),
    );
    expect(session.passkeyChallenge).toBeUndefined();
  });

  it('rejects a registration without a fresh challenge for that user', async () => {
    const session: PasskeySession = {
      passkeyChallenge: {
        challenge: 'c',
        purpose: 'register',
        userId: 'someone-else',
        expiresAt: Date.now() + 60_000,
      },
    };
    await expect(
      service.verifyRegistration('user-1', session, {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.verifyRegistrationResponse).not.toHaveBeenCalled();
  });

  it('logs in with a known passkey and updates the counter', async () => {
    mocked.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'login-challenge',
    } as never);
    mocked.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    } as never);
    prisma.passkey.findUnique.mockResolvedValue(storedPasskey);
    const session: PasskeySession = {};

    await service.authenticationOptions(session);
    const result = await service.verifyAuthentication(session, {
      id: 'cred-1',
    } as AuthenticationResponseJSON);

    expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    expect(result).not.toHaveProperty('onboardingAssessment');
    expect(mocked.verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'login-challenge',
        requireUserVerification: true,
        credential: expect.objectContaining({ id: 'cred-1', counter: 4 }),
      }),
    );
    expect(prisma.passkey.update).toHaveBeenCalledWith({
      where: { id: 'pk-1' },
      data: { counter: BigInt(5), lastUsedAt: expect.any(Date) },
    });
  });

  it('does not reuse a login challenge', async () => {
    mocked.verifyAuthenticationResponse.mockRejectedValue(new Error('bad'));
    prisma.passkey.findUnique.mockResolvedValue(storedPasskey);
    const session: PasskeySession = {
      passkeyChallenge: {
        challenge: 'c',
        purpose: 'login',
        expiresAt: Date.now() + 60_000,
      },
    };
    const response = { id: 'cred-1' } as AuthenticationResponseJSON;

    await expect(
      service.verifyAuthentication(session, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.verifyAuthentication(session, response),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses unknown passkeys and inactive accounts', async () => {
    const challenge = () => ({
      passkeyChallenge: {
        challenge: 'c',
        purpose: 'login' as const,
        expiresAt: Date.now() + 60_000,
      },
    });
    prisma.passkey.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.verifyAuthentication(challenge(), { id: 'x' } as never),
    ).rejects.toThrow('Passkey non riconosciuta');

    mocked.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 0 },
    } as never);
    prisma.passkey.findUnique.mockResolvedValueOnce({
      ...storedPasskey,
      user: { ...user, isActive: false },
    });
    await expect(
      service.verifyAuthentication(challenge(), { id: 'cred-1' } as never),
    ).rejects.toThrow('Account in attesa di attivazione amministratore');
    expect(prisma.passkey.update).not.toHaveBeenCalled();
  });

  it('deletes only the current user passkeys', async () => {
    prisma.passkey.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('user-1', 'pk-other')).rejects.toThrow(
      'Passkey non trovata',
    );
    expect(prisma.passkey.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pk-other', userId: 'user-1' },
    });
  });
});

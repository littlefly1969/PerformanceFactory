import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { inactiveAccountMessage } from './auth.service';

/** Il challenge vale pochi minuti e una sola volta. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Abbastanza per telefono, tablet e computer, senza crescere all'infinito. */
const MAX_PASSKEYS_PER_USER = 10;
const RP_NAME = 'Performance Factory';

type PasskeyChallenge = {
  challenge: string;
  purpose: 'register' | 'login';
  userId?: string;
  expiresAt: number;
};

export type PasskeySession = { passkeyChallenge?: PasskeyChallenge };

export type PasskeyConfig = { rpID: string; origins: string[] };

/**
 * Dominio e origini da cui le passkey sono valide. Derivano da WEB_ORIGIN, lo
 * stesso indirizzo del sito: una passkey creata su un altro dominio, o su una
 * pagina di phishing, non viene mai accettata.
 */
export function passkeyConfig(env = process.env): PasskeyConfig {
  const origins = (env.WEB_ORIGIN ?? 'http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const rpID = env.WEBAUTHN_RP_ID?.trim() || new URL(origins[0]).hostname;
  return { rpID, origins };
}

/** Nome leggibile del dispositivo, da mostrare nell'elenco in Account. */
export function passkeyDeviceName(userAgent?: string) {
  const ua = userAgent ?? '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Dispositivo';
}

@Injectable()
export class PasskeyService {
  constructor(private readonly prisma: PrismaService) {}

  async registrationOptions(userId: string, session: PasskeySession) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        passkeys: { select: { credentialId: true, transports: true } },
      },
    });
    if (!user) throw new UnauthorizedException('Utente mancante');
    if (user.passkeys.length >= MAX_PASSKEYS_PER_USER) {
      throw new BadRequestException(
        'Hai già il numero massimo di passkey: eliminane una prima di aggiungerne un’altra.',
      );
    }
    const { rpID } = passkeyConfig();
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: user.email,
      userDisplayName: displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((passkey) => ({
        id: passkey.credentialId,
        transports: passkey.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    this.storeChallenge(session, options.challenge, 'register', userId);
    return options;
  }

  async verifyRegistration(
    userId: string,
    session: PasskeySession,
    response: RegistrationResponseJSON,
    userAgent?: string,
  ) {
    const challenge = this.takeChallenge(session, 'register', userId);
    const { rpID, origins } = passkeyConfig();
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException('Passkey non valida, riprova.');
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey non valida, riprova.');
    }
    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;
    const existing = await this.prisma.passkey.findUnique({
      where: { credentialId: credential.id },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('Questa passkey è già registrata.');
    }
    const passkey = await this.prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: passkeyDeviceName(userAgent),
      },
      select: passkeySummarySelect,
    });
    return passkey;
  }

  list(userId: string) {
    return this.prisma.passkey.findMany({
      where: { userId },
      select: passkeySummarySelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.passkey.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('Passkey non trovata');
    return { ok: true };
  }

  async authenticationOptions(session: PasskeySession) {
    const { rpID } = passkeyConfig();
    // Nessuna credenziale indicata: il telefono propone le passkey salvate per
    // questo sito, senza che l'utente scriva l'e-mail.
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
    });
    this.storeChallenge(session, options.challenge, 'login');
    return options;
  }

  async verifyAuthentication(
    session: PasskeySession,
    response: AuthenticationResponseJSON,
  ) {
    const challenge = this.takeChallenge(session, 'login');
    if (typeof response?.id !== 'string' || !response.id) {
      throw new BadRequestException('Risposta passkey non valida.');
    }
    const passkey = await this.prisma.passkey.findUnique({
      where: { credentialId: response.id },
      include: {
        user: {
          include: { onboardingAssessment: { select: { status: true } } },
        },
      },
    });
    if (!passkey) {
      throw new UnauthorizedException(
        'Passkey non riconosciuta: accedi con e-mail e password.',
      );
    }
    const { rpID, origins } = passkeyConfig();
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch {
      throw new UnauthorizedException('Accesso con passkey non riuscito.');
    }
    if (!verification.verified) {
      throw new UnauthorizedException('Accesso con passkey non riuscito.');
    }
    const { user } = passkey;
    if (user.isActive === false) {
      throw new UnauthorizedException(
        inactiveAccountMessage(user.onboardingAssessment?.status),
      );
    }
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });
    const { onboardingAssessment: _onboarding, ...plain } = user;
    void _onboarding;
    return plain;
  }

  private storeChallenge(
    session: PasskeySession,
    challenge: string,
    purpose: PasskeyChallenge['purpose'],
    userId?: string,
  ) {
    session.passkeyChallenge = {
      challenge,
      purpose,
      userId,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    };
  }

  /** Legge e consuma il challenge: una risposta non può essere riusata. */
  private takeChallenge(
    session: PasskeySession,
    purpose: PasskeyChallenge['purpose'],
    userId?: string,
  ) {
    const stored = session.passkeyChallenge;
    session.passkeyChallenge = undefined;
    if (
      !stored ||
      stored.purpose !== purpose ||
      stored.userId !== userId ||
      stored.expiresAt < Date.now()
    ) {
      throw new BadRequestException('Richiesta passkey scaduta, riprova.');
    }
    return stored.challenge;
  }
}

const passkeySummarySelect = {
  id: true,
  name: true,
  deviceType: true,
  backedUp: true,
  createdAt: true,
  lastUsedAt: true,
} as const;

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createPublicKey, createVerify, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type GoogleOidcMode = 'login' | 'register';

type GoogleOidcSession = {
  state: string;
  nonce: string;
  codeVerifier: string;
  mode: GoogleOidcMode;
  returnTo: string;
  createdAt: number;
};

type SessionCarrier = {
  session?: { googleOidc?: GoogleOidcSession; userId?: string };
  raw?: { session?: { googleOidc?: GoogleOidcSession; userId?: string } };
};

type GoogleTokenResponse = {
  id_token?: string;
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

type GoogleClaims = {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
  hd?: string;
  nonce?: string;
  exp?: number;
  iat?: number;
};

type JsonWebKeySet = {
  keys?: Array<{
    kid?: string;
    kty?: string;
    alg?: string;
    use?: string;
    n?: string;
    e?: string;
  }>;
};

const GOOGLE_PROVIDER = 'google';
const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleOidcService {
  constructor(private readonly prisma: PrismaService) {}

  buildAuthorizationUrl(
    req: SessionCarrier,
    mode: GoogleOidcMode,
    returnToInput?: string,
  ) {
    const clientId = this.requiredEnv('GOOGLE_OIDC_CLIENT_ID');
    const redirectUri = this.requiredEnv('GOOGLE_OIDC_REDIRECT_URI');
    const state = this.randomToken();
    const nonce = this.randomToken();
    const codeVerifier = this.randomToken();
    const returnTo = this.safeReturnTo(returnToInput);

    this.session(req).googleOidc = {
      state,
      nonce,
      codeVerifier,
      mode,
      returnTo,
      createdAt: Date.now(),
    };

    const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', this.codeChallengeForVerifier(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');

    const hostedDomain = process.env.GOOGLE_OIDC_HOSTED_DOMAIN?.trim();
    if (hostedDomain) {
      url.searchParams.set('hd', hostedDomain);
    }

    return url.toString();
  }

  async handleCallback(
    req: SessionCarrier,
    input: { code?: string; state?: string; error?: string },
  ) {
    if (input.error) {
      throw new UnauthorizedException(`Google OIDC error: ${input.error}`);
    }
    if (!input.code || !input.state) {
      throw new BadRequestException('Google callback incompleta');
    }

    const session = this.session(req);
    const oidc = session.googleOidc;
    session.googleOidc = undefined;
    if (!oidc || oidc.state !== input.state) {
      throw new UnauthorizedException('Stato Google OIDC non valido');
    }
    if (Date.now() - oidc.createdAt > STATE_TTL_MS) {
      throw new UnauthorizedException('Stato Google OIDC scaduto');
    }

    const tokenResponse = await this.exchangeCode(input.code, oidc.codeVerifier);
    if (!tokenResponse.id_token) {
      throw new UnauthorizedException('Google non ha restituito id_token');
    }

    const claims = await this.verifyIdToken(tokenResponse.id_token, oidc.nonce);
    const user = await this.resolveApplicationUser(oidc.mode, claims);
    session.userId = user.id;

    return { user, returnTo: oidc.returnTo };
  }

  failureRedirect(error: unknown) {
    const base = process.env.WEB_LOGIN_FAILURE_URL ?? `${this.webOrigin()}/login`;
    const url = new URL(base);
    const message =
      error instanceof Error ? error.message : 'Autenticazione Google fallita';
    url.searchParams.set('error', message);
    return url.toString();
  }

  successRedirect(returnTo: string) {
    return returnTo;
  }

  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<GoogleTokenResponse> {
    const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.requiredEnv('GOOGLE_OIDC_CLIENT_ID'),
        client_secret: this.requiredEnv('GOOGLE_OIDC_CLIENT_SECRET'),
        redirect_uri: this.requiredEnv('GOOGLE_OIDC_REDIRECT_URI'),
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      throw new UnauthorizedException(
        `Scambio codice Google fallito: ${await response.text()}`,
      );
    }
    return (await response.json()) as GoogleTokenResponse;
  }

  private async verifyIdToken(idToken: string, nonce: string) {
    const [encodedHeader, encodedPayload, signature] = idToken.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('id_token Google non valido');
    }

    const header = this.parseJwtPart<{ kid?: string; alg?: string }>(
      encodedHeader,
    );
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Firma Google non supportata');
    }

    const jwksResponse = await fetch(GOOGLE_JWKS_ENDPOINT);
    if (!jwksResponse.ok) {
      throw new UnauthorizedException('JWKS Google non disponibile');
    }
    const jwks = (await jwksResponse.json()) as JsonWebKeySet;
    const key = jwks.keys?.find((item) => item.kid === header.kid);
    if (!key?.n || !key.e) {
      throw new UnauthorizedException('Chiave firma Google non trovata');
    }

    const publicKey = createPublicKey({
      key: {
        kty: key.kty ?? 'RSA',
        n: key.n,
        e: key.e,
      },
      format: 'jwk',
    });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const valid = verifier.verify(publicKey, this.base64UrlDecode(signature));
    if (!valid) {
      throw new UnauthorizedException('Firma id_token Google non valida');
    }

    const claims = this.parseJwtPart<GoogleClaims>(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp < now) {
      throw new UnauthorizedException('id_token Google scaduto');
    }
    if (!claims.iat || claims.iat > now + 60) {
      throw new UnauthorizedException('id_token Google con iat non valido');
    }
    if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) {
      throw new UnauthorizedException('Issuer Google non valido');
    }
    if (claims.aud !== this.requiredEnv('GOOGLE_OIDC_CLIENT_ID')) {
      throw new UnauthorizedException('Audience Google non valida');
    }
    if (claims.nonce !== nonce) {
      throw new UnauthorizedException('Nonce Google non valido');
    }
    if (!claims.sub || !claims.email || claims.email_verified !== true) {
      throw new UnauthorizedException('Email Google non verificata');
    }

    const hostedDomain = process.env.GOOGLE_OIDC_HOSTED_DOMAIN?.trim();
    if (hostedDomain && claims.hd !== hostedDomain) {
      throw new UnauthorizedException('Dominio Google Workspace non autorizzato');
    }

    return claims;
  }

  private async resolveApplicationUser(mode: GoogleOidcMode, claims: GoogleClaims) {
    const email = claims.email?.trim().toLowerCase();
    const subject = claims.sub?.trim();
    if (!email || !subject) {
      throw new UnauthorizedException('Identita Google incompleta');
    }

    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_subject: { provider: GOOGLE_PROVIDER, subject },
      },
      include: { user: true },
    });
    if (existingIdentity) {
      if (!existingIdentity.user.isActive) {
        throw new UnauthorizedException('Account in attesa di attivazione admin');
      }
      await this.prisma.authIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          email,
          emailVerified: claims.email_verified === true,
          profileJson: this.profileJson(claims),
          lastLoginAt: new Date(),
        },
      });
      return existingIdentity.user;
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      if (process.env.GOOGLE_OIDC_AUTO_LINK_VERIFIED_EMAIL !== 'true') {
        throw new UnauthorizedException(
          'Email gia registrata: collega Google dopo accesso tradizionale',
        );
      }
      if (!existingUser.isActive) {
        throw new UnauthorizedException('Account in attesa di attivazione admin');
      }
      await this.createIdentity(existingUser.id, claims);
      return existingUser;
    }

    if (mode !== 'register') {
      throw new UnauthorizedException('Account Google non registrato');
    }

    const password = await bcrypt.hash(
      `google:${subject}:${this.randomToken()}`,
      10,
    );
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password,
          role: UserRole.USER,
          firstName: claims.given_name ?? null,
          lastName: claims.family_name ?? null,
          isActive: false,
          onboardingAssessment: {
            create: { status: 'PENDING' },
          },
        },
      });
      await tx.authIdentity.create({
        data: {
          userId: user.id,
          provider: GOOGLE_PROVIDER,
          subject,
          email,
          emailVerified: claims.email_verified === true,
          profileJson: this.profileJson(claims),
          lastLoginAt: new Date(),
        },
      });
      return user;
    });
  }

  private createIdentity(userId: string, claims: GoogleClaims) {
    return this.prisma.authIdentity.create({
      data: {
        userId,
        provider: GOOGLE_PROVIDER,
        subject: claims.sub ?? '',
        email: claims.email?.trim().toLowerCase() ?? '',
        emailVerified: claims.email_verified === true,
        profileJson: this.profileJson(claims),
        lastLoginAt: new Date(),
      },
    });
  }

  private profileJson(claims: GoogleClaims): Prisma.InputJsonValue {
    return {
      name: claims.name ?? null,
      given_name: claims.given_name ?? null,
      family_name: claims.family_name ?? null,
      picture: claims.picture ?? null,
      hd: claims.hd ?? null,
    };
  }

  private parseJwtPart<T>(value: string): T {
    return JSON.parse(this.base64UrlDecode(value).toString('utf8')) as T;
  }

  private base64UrlDecode(value: string) {
    return Buffer.from(value, 'base64url');
  }

  private randomToken() {
    return randomBytes(32).toString('base64url');
  }

  private requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new BadRequestException(`${name} non configurato`);
    }
    return value;
  }

  private safeReturnTo(returnToInput?: string) {
    const fallback = process.env.WEB_LOGIN_SUCCESS_URL ?? `${this.webOrigin()}/`;
    if (!returnToInput) {
      return fallback;
    }
    try {
      const parsed = new URL(returnToInput, this.webOrigin());
      if (parsed.origin !== this.webOrigin()) {
        return fallback;
      }
      return parsed.toString();
    } catch {
      return fallback;
    }
  }

  private webOrigin() {
    return (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000').split(',')[0];
  }

  private session(req: SessionCarrier) {
    const session = req.session ?? req.raw?.session;
    if (!session) {
      throw new BadRequestException('Sessione non disponibile');
    }
    return session;
  }

  codeChallengeForVerifier(verifier: string) {
    return createHash('sha256').update(verifier).digest('base64url');
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { signAccessToken } from '../common/auth-token';
import { ConsentsService } from '../consents/consents.service';

export type SafeUser = {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  isActive?: boolean;
  createdAt: Date;
};

type SessionCarrier = {
  session?: { userId?: string };
  raw?: { session?: { userId?: string } };
};

type LogoutSession = {
  destroy?: (cb: () => void) => void;
  userId?: string;
  passport?: { user?: string };
};

type LogoutCarrier = {
  logout?: (cb: (err?: unknown) => void) => void;
  session?: LogoutSession;
  raw?: { session?: LogoutSession };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents?: ConsentsService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        onboardingAssessment: { select: { status: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    if (user.isActive === false) {
      if (user.onboardingAssessment?.status === 'REJECTED') {
        throw new UnauthorizedException(
          'Candidatura rifiutata. Puoi riproporre una nuova richiesta di registrazione.',
        );
      }
      throw new UnauthorizedException(
        'Account in attesa di attivazione amministratore',
      );
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    return user;
  }

  sanitizeUser(user: { password?: string }) {
    const { password: _password, ...safe } = user as SafeUser & {
      password?: string;
    };
    void _password;
    return safe;
  }

  async hasAiConsent(userId: string): Promise<boolean> {
    if (!userId) {
      return false;
    }
    const consent = await this.prisma.consent.findFirst({
      where: {
        userId,
        type: { in: ['AI', 'AI_ASSISTANT'] },
        withdrawnAt: null,
      },
      select: { id: true },
    });
    return !!consent;
  }

  async requiredConsentStatus(userId: string) {
    if (!this.consents) {
      return {
        required: false,
        missingConsents: [],
        documents: [],
        acceptedConsents: [],
      };
    }
    return this.consents.status(userId);
  }

  async isOnboardingRequired(userId: string, role?: string) {
    if (!userId || role !== UserRole.USER) {
      return false;
    }
    const [onboarding, goal] = await Promise.all([
      this.prisma.userOnboardingAssessment.findUnique({
        where: { userId },
        select: { status: true },
      }),
      this.prisma.userPerformanceGoal.findUnique({
        where: { userId },
        select: { frozenAt: true },
      }),
    ]);
    return onboarding?.status !== 'COMPLETED' || !goal?.frozenAt;
  }

  async login(
    req: {
      user?: unknown;
    } & SessionCarrier,
  ) {
    const user = req.user as { id?: string; password?: string } | undefined;
    if (!user) {
      throw new UnauthorizedException('Utente mancante');
    }

    return this.createApplicationSession(req, user);
  }

  async createApplicationSession(
    req: SessionCarrier,
    user: { id?: string; password?: string },
  ) {
    const userId = user.id;
    if (userId) {
      if (req.session) {
        req.session.userId = userId;
      }
      if (req.raw?.session) {
        req.raw.session.userId = userId;
      }
    }

    const safe = this.sanitizeUser(user) as SafeUser & { role: UserRole };
    const token = signAccessToken({
      id: safe.id,
      email: safe.email,
      role: safe.role,
    });
    const aiConsent = await this.hasAiConsent(safe.id);
    const requiredConsents = await this.requiredConsentStatus(safe.id);
    const onboardingRequired = await this.isOnboardingRequired(
      safe.id,
      safe.role,
    );

    return {
      ...safe,
      aiConsent,
      consentRequired: requiredConsents.required,
      missingConsents: requiredConsents.missingConsents,
      onboardingRequired,
      tokenType: 'Bearer',
      ...token,
    };
  }

  issueAccessToken(user: unknown) {
    const safe = this.sanitizeUser(
      user as { password?: string },
    ) as SafeUser & {
      role: UserRole;
    };
    const token = signAccessToken({
      id: safe.id,
      email: safe.email,
      role: safe.role,
    });
    return {
      tokenType: 'Bearer',
      ...token,
    };
  }

  async logout(req: unknown) {
    const request = req as LogoutCarrier;
    await this.logoutPassport(request);

    const sessions = [request.session, request.raw?.session].filter(
      (session, index, all): session is LogoutSession =>
        !!session && all.indexOf(session) === index,
    );

    for (const session of sessions) {
      if (session.destroy) {
        await new Promise<void>((resolve) => {
          session.destroy?.(() => resolve());
        });
      } else {
        session.userId = undefined;
        if (session.passport) {
          session.passport.user = undefined;
        }
      }
    }
    return { ok: true };
  }

  private async logoutPassport(request: LogoutCarrier) {
    if (!request.logout) {
      return;
    }
    await new Promise<void>((resolve) => {
      request.logout?.(() => resolve());
    });
  }
}

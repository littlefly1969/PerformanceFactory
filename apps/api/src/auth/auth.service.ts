import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, UserRole } from '@prisma/client';
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
      throw new UnauthorizedException('Account in attesa di attivazione amministratore');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    return user;
  }

  async registerAthlete(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    aiConsent?: boolean;
    privacyAccepted?: boolean;
    aiAssistantAccepted?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const firstName = input.firstName?.trim();
    const lastName = input.lastName?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!firstName || !lastName || !email || !password) {
      throw new BadRequestException('Dati registrazione atleta mancanti');
    }
    if (password.length < 8) {
      throw new BadRequestException('La password deve avere almeno 8 caratteri');
    }
    if (this.consents) {
      await this.consents.assertAcceptedCurrentDocuments(input);
    } else if (
      input.privacyAccepted !== true ||
      input.aiAssistantAccepted !== true
    ) {
      throw new BadRequestException(
        'Privacy e utilizzo dell assistente AI devono essere accettati esplicitamente',
      );
    }

    const [existingUser, existingIdentity] = await Promise.all([
      this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          role: true,
          isActive: true,
          onboardingAssessment: { select: { status: true } },
        },
      }),
      this.prisma.authIdentity.findFirst({
        where: { email },
        select: { id: true },
      }),
    ]);
    if (existingIdentity) {
      throw new BadRequestException(
        'Non e possibile registrarsi: la mail e gia presente nel sistema',
      );
    }
    if (existingUser) {
      if (
        existingUser.role === UserRole.USER &&
        existingUser.isActive === false &&
        existingUser.onboardingAssessment?.status === 'REJECTED'
      ) {
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              firstName,
              lastName,
              password: passwordHash,
              isActive: false,
              onboardingAssessment: {
                upsert: {
                  update: {
                    status: 'PENDING',
                    answersJson: Prisma.JsonNull,
                    profileJson: Prisma.JsonNull,
                    completedAt: null,
                  },
                  create: { status: 'PENDING' },
                },
              },
            },
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          });

          return updated;
        });

        if (this.consents) {
          await this.consents.grantRequired(user.id, {
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            source: 'password_register',
          });
        }

        return {
          ...user,
          aiConsent: true,
          status: 'PENDING_ADMIN_ACTIVATION',
        };
      }
      throw new BadRequestException(
        'Non e possibile registrarsi: la mail e gia presente nel sistema',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: passwordHash,
          role: UserRole.USER,
          isActive: false,
          onboardingAssessment: {
            create: { status: 'PENDING' },
          },
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      return created;
    });

    if (this.consents) {
      await this.consents.grantRequired(user.id, {
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        source: 'password_register',
      });
    }

    return {
      ...user,
      aiConsent: true,
      status: 'PENDING_ADMIN_ACTIVATION',
    };
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
        select: { id: true },
      }),
    ]);
    return onboarding?.status !== 'COMPLETED' || !goal;
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
    const safe = this.sanitizeUser(user as { password?: string }) as SafeUser & {
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
    const request = req as {
      session?: { destroy?: (cb: () => void) => void; userId?: string };
      raw?: {
        session?: { destroy?: (cb: () => void) => void; userId?: string };
      };
    };
    const session = request.session ?? request.raw?.session;
    if (session?.destroy) {
      await new Promise<void>((resolve) => {
        session.destroy?.(() => resolve());
      });
    } else if (session) {
      session.userId = undefined;
    }
    return { ok: true };
  }
}

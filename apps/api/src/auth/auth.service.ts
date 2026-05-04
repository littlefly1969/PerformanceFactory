import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { signAccessToken } from '../common/auth-token';

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
  constructor(private readonly prisma: PrismaService) {}

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
      throw new UnauthorizedException('Account in attesa di attivazione admin');
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

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        isActive: true,
        onboardingAssessment: { select: { status: true } },
      },
    });
    if (existing) {
      if (
        existing.role === UserRole.USER &&
        existing.isActive === false &&
        existing.onboardingAssessment?.status === 'REJECTED'
      ) {
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await this.prisma.$transaction(async (tx) => {
          const updated = await tx.user.update({
            where: { id: existing.id },
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

          if (input.aiConsent === true) {
            const existingConsent = await tx.consent.findFirst({
              where: { userId: updated.id, type: 'AI' },
              select: { id: true },
            });
            if (!existingConsent) {
              await tx.consent.create({
                data: {
                  userId: updated.id,
                  type: 'AI',
                },
              });
            }
          } else {
            await tx.consent.deleteMany({
              where: {
                userId: updated.id,
                type: 'AI',
              },
            });
          }

          return updated;
        });

        return {
          ...user,
          aiConsent: input.aiConsent === true,
          status: 'PENDING_ADMIN_ACTIVATION',
        };
      }
      throw new BadRequestException('Utente gia esistente');
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

      if (input.aiConsent === true) {
        await tx.consent.create({
          data: {
            userId: created.id,
            type: 'AI',
          },
        });
      }

      return created;
    });

    return {
      ...user,
      aiConsent: input.aiConsent === true,
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
      where: { userId, type: 'AI' },
      select: { id: true },
    });
    return !!consent;
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
    const onboardingRequired = await this.isOnboardingRequired(
      safe.id,
      safe.role,
    );

    return {
      ...safe,
      aiConsent,
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

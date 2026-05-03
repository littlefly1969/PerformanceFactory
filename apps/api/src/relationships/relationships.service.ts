import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AbacService } from '../common/policies/abac.service';

const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
};

type SafeUser = {
  id: string;
  email: string;
  role: UserRole;
  createdAt: Date;
};

@Injectable()
export class RelationshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abac: AbacService,
  ) {}

  private stripPassword<T extends Record<string, unknown>>(
    user: T,
  ): Omit<T, 'password'> {
    const { password: _password, ...safe } = user as T & {
      password?: unknown;
    };
    void _password;
    return safe;
  }

  async linkUser(
    professionalId: string,
    userId?: string,
    userEmail?: string,
    areaId?: string,
  ) {
    if (!professionalId) {
      throw new BadRequestException('ID professionista mancante');
    }

    if ((!userId && !userEmail) || !areaId) {
      throw new BadRequestException('Identificativo utente o area mancante');
    }

    const [professional, user, competence] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: professionalId } }),
      userId
        ? this.prisma.user.findUnique({ where: { id: userId } })
        : this.prisma.user.findUnique({ where: { email: userEmail ?? '' } }),
      this.prisma.professionalAreaCompetence.findUnique({
        where: { professionalId_areaId: { professionalId, areaId } },
      }),
    ]);

    if (!professional || professional.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException('Professionista non valido');
    }

    if (!user || user.role !== UserRole.USER) {
      throw new BadRequestException('Utente non valido');
    }
    if (!competence) {
      throw new BadRequestException(
        'Il professionista non e abilitato per questa area',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.professionalUserLink.deleteMany({
        where: {
          userId: user.id,
          areaId,
          professionalId: { not: professionalId },
        },
      });

      const link = await tx.professionalUserLink.upsert({
        where: {
          userId_areaId: { userId: user.id, areaId },
        },
        update: { professionalId },
        create: { professionalId, userId: user.id, areaId },
      });

      await tx.questionSetAreaApproval.updateMany({
        where: {
          areaId,
          status: 'PENDING',
          professionalId: { not: professionalId },
          questionSet: {
            userId: user.id,
            status: 'PENDING_APPROVAL',
          },
        },
        data: {
          professionalId,
          approvedByProfessionalId: null,
          approvedAt: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });

      return link;
    });
  }

  async getMyUsers(professionalId: string) {
    const links = await this.prisma.professionalUserLink.findMany({
      where: { professionalId },
      select: {
        userId: true,
        user: { select: safeUserSelect },
      },
    });

    const allowed: SafeUser[] = [];
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.userId)) {
        continue;
      }
      const ok = await this.abac.canAccessUser(professionalId, link.userId);
      if (ok) {
        seen.add(link.userId);
        allowed.push(this.stripPassword(link.user as SafeUser));
      }
    }

    return allowed;
  }

  async getMyProfessionals(userId: string) {
    const links = await this.prisma.professionalUserLink.findMany({
      where: { userId },
      select: {
        professional: { select: safeUserSelect },
      },
    });
    return links.map((link) =>
      this.stripPassword(link.professional as SafeUser),
    );
  }
}

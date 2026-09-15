import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentsService } from '../consents/consents.service';
import { RegisterAthleteDto } from '../auth/dto/register-athlete.dto';
import { DiscoveryService } from './discovery.service';
import { validateDiscovery } from './discovery-validation';

@Injectable()
export class AthleteRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly consents: ConsentsService,
  ) {}

  async register(input: RegisterAthleteDto) {
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName)
      throw new BadRequestException('Nome e cognome obbligatori');
    const email = input.email.trim().toLowerCase();
    const password = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.prisma.$transaction(
        async (tx) => {
          const configuration = await this.discovery.configuration(tx);
          const draft = validateDiscovery(configuration, input.discovery);
          const identity = await tx.authIdentity.findFirst({
            where: { email },
            select: { id: true },
          });
          if (identity) throw new BadRequestException('Email già registrata');
          const goalQuestion = configuration.questions.find(
            (q) => q.target === 'goalId',
          );
          const goal = goalQuestion?.options.find((o) => o.id === draft.goalId);
          return tx.user.create({
            data: {
              email,
              password,
              firstName,
              lastName,
              role: 'USER',
              isActive: true,
              onboardingAssessment: { create: { status: 'PENDING' } },
              sportSelection: {
                create: {
                  sportId: draft.sportId!,
                  specializationId: draft.specializationId!,
                },
              },
              performanceGoal: { create: { goalText: goal!.label } },
              discovery: {
                create: {
                  version: BigInt(configuration.version),
                  draft: JSON.parse(
                    JSON.stringify(draft),
                  ) as Prisma.InputJsonValue,
                  configuration: JSON.parse(
                    JSON.stringify(configuration),
                  ) as Prisma.InputJsonValue,
                  phase: 'CONSENTS',
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
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return { user, journey: { phase: 'CONSENTS', nextStep: 'CONSENTS' } };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new BadRequestException('Email già registrata');
      throw error;
    }
  }

  async journey(userId: string) {
    const discovery = await this.prisma.athleteDiscovery.findUnique({
      where: { userId },
      select: { phase: true },
    });
    if (!discovery)
      throw new NotFoundException('Percorso discovery non trovato');
    const status = await this.consents.status(userId);
    const nextStep = status.required ? 'CONSENTS' : 'ASSESSMENT';
    return { phase: nextStep, nextStep };
  }
}

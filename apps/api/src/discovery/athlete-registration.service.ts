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
import { QuizDraftService } from './quiz-draft.service';
import { PartnersService } from '../partners/partners.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { AttributionInput } from '../partners/attribution';

export const ADULT_REQUIRED_MESSAGE =
  'Performance Factory è riservata ai maggiorenni: conferma di avere almeno 18 anni.';

@Injectable()
export class AthleteRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryService,
    private readonly consents: ConsentsService,
    private readonly partners: PartnersService,
    private readonly analytics: AnalyticsService,
  ) {}

  async register(input: RegisterAthleteDto) {
    return this.createAthlete(input);
  }

  async createAthlete(
    input: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      discovery: unknown;
      /** Bozza server del quiz: fissa la versione e si collega una volta sola. */
      quizToken?: string;
      adultConfirmed?: boolean;
      attribution?: AttributionInput;
    },
    google?: {
      subject: string;
      profileJson: Prisma.InputJsonValue;
      documents: Awaited<ReturnType<ConsentsService['requiredDocuments']>>;
      marketingAccepted?: boolean;
      audit: { ipAddress?: string | null; userAgent?: string | null };
    },
  ) {
    // Age gate MVP 18+ (A2-D01): dichiarazione esplicita, prima di ogni scrittura.
    if (input.adultConfirmed !== true)
      throw new BadRequestException(ADULT_REQUIRED_MESSAGE);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName)
      throw new BadRequestException('Nome e cognome obbligatori');
    const email = input.email.trim().toLowerCase();
    const password = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.prisma.$transaction(
        async (tx) => {
          // Con la bozza server vale la versione con cui il quiz è iniziato
          // (F1): un cambio di configurazione non resetta né reinterpreta.
          const saved = input.quizToken
            ? await QuizDraftService.consume(tx, input.quizToken)
            : null;
          const configuration =
            saved?.configuration ?? (await this.discovery.configuration(tx));
          const draft = validateDiscovery(
            configuration,
            input.discovery ?? saved?.draft,
          );
          const identity = await tx.authIdentity.findFirst({
            where: { email },
            select: { id: true },
          });
          if (identity) throw new BadRequestException('Email già registrata');
          const goalQuestion = configuration.questions.find(
            (q) => q.target === 'goalId',
          );
          const goal = goalQuestion?.options.find((o) => o.id === draft.goalId);
          const created = await tx.user.create({
            data: {
              email,
              password,
              firstName,
              lastName,
              role: 'USER',
              isActive: true,
              adultConfirmedAt: new Date(),
              authIdentities: google
                ? {
                    create: {
                      provider: 'google',
                      subject: google.subject,
                      email,
                      emailVerified: true,
                      profileJson: google.profileJson,
                      lastLoginAt: new Date(),
                    },
                  }
                : {
                    create: {
                      provider: 'local',
                      subject: email,
                      email,
                      emailVerified: false,
                      lastLoginAt: new Date(),
                    },
                  },
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
          if (google) {
            for (const document of google.documents)
              await this.consents.createConsent(tx, created.id, document, {
                ...google.audit,
                source: 'google_register',
              });
            if (google.marketingAccepted === true)
              await this.consents.setMarketing(tx, created.id, true, {
                ...google.audit,
                source: 'google_register',
              });
          }
          const origin = await this.partners.recordAttribution(
            tx,
            created.id,
            input.attribution,
          );
          await this.analytics.trackServer(
            'registration_completed',
            {
              userId: created.id,
              anonymousId: origin.anonymousId,
              properties: {
                method: google ? 'google' : 'email',
                source: origin.source ?? 'direct',
                ...(origin.campaign && { campaign: origin.campaign }),
                ...(origin.club && { club: origin.club }),
                referred: origin.referred,
              },
            },
            tx,
          );
          return created;
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
    const nextStep = status.required
      ? 'CONSENTS'
      : discovery.phase === 'COMPLETE'
        ? 'COMPLETE'
        : 'ASSESSMENT';
    return { phase: nextStep, nextStep };
  }
}

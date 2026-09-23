import { BadRequestException, Injectable } from '@nestjs/common';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { profileValue } from '../ai-orchestrator/training-constraints';

export class TrainingAvailabilityDto {
  @ApiProperty({ enum: ['0_1', '2_3', '4_5', '6_PLUS'] })
  @IsIn(['0_1', '2_3', '4_5', '6_PLUS'])
  currentFrequency!: string;
  @ApiProperty({ minimum: 1, maximum: 7 })
  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek!: number;
  @ApiProperty({ enum: [30, 45, 60, 90, 120] })
  @IsIn([30, 45, 60, 90, 120])
  sessionDurationMinutes!: number;
  @ApiPropertyOptional({ enum: [4, 12, 52] })
  @IsOptional()
  @IsIn([4, 12, 52])
  programDurationWeeks?: number;
  @ApiPropertyOptional({
    type: [Number],
    description: 'Giorni ISO: lunedì 1, domenica 7',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  preferredDays?: number[];
}
@Injectable()
export class TrainingAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}
  async get(userId: string) {
    const [assessment, discovery] = await Promise.all([
      this.prisma.userOnboardingAssessment.findUnique({ where: { userId } }),
      this.prisma.athleteDiscovery.findUnique({
        where: { userId },
        select: { programDurationWeeks: true },
      }),
    ]);
    const profile = assessment?.profileJson;
    return {
      currentFrequency:
        profileValue(profile, 'general_training_frequency') ??
        profileValue(profile, 'pf4_frequency') ??
        null,
      daysPerWeek: profileValue(profile, 'training_days_available') ?? null,
      sessionDurationMinutes:
        profileValue(profile, 'training_session_duration') ?? null,
      preferredDays: profileValue(profile, 'preferred_training_days') ?? [],
      programDurationWeeks:
        discovery?.programDurationWeeks ??
        profileValue(profile, 'program_duration_weeks') ??
        null,
    };
  }
  async save(userId: string, input: TrainingAvailabilityDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`training-profile:${userId}`}))`;
      const assessment = await tx.userOnboardingAssessment.findUnique({
        where: { userId },
      });
      if (assessment?.status !== 'COMPLETED')
        throw new BadRequestException('Completa prima il tuo profilo iniziale');
      const profile =
        assessment.profileJson &&
        typeof assessment.profileJson === 'object' &&
        !Array.isArray(assessment.profileJson)
          ? assessment.profileJson
          : {};
      const values = {
        general_training_frequency: {
          label: 'Frequenza abituale',
          value: input.currentFrequency,
        },
        training_days_available: {
          label: 'Giorni disponibili',
          value: input.daysPerWeek,
        },
        training_session_duration: {
          label: 'Minuti disponibili per sessione',
          value: input.sessionDurationMinutes,
        },
        ...(input.preferredDays
          ? {
              preferred_training_days: {
                label: 'Giorni preferiti ISO',
                value: input.preferredDays,
              },
            }
          : {}),
        ...(input.programDurationWeeks
          ? {
              program_duration_weeks: {
                label: 'Durata programma',
                value: input.programDurationWeeks,
              },
            }
          : {}),
      };
      await tx.userOnboardingAssessment.update({
        where: { userId },
        data: {
          profileJson: { ...profile, ...values } as Prisma.InputJsonObject,
        },
      });
      if (input.programDurationWeeks)
        await tx.athleteDiscovery.updateMany({
          where: { userId },
          data: {
            programDurationWeeks: input.programDurationWeeks,
            durationSelectedAt: new Date(),
          },
        });
      // Preserve the immutable registration configuration; subsequent generations consume the updated profile.
      await tx.trainingLifecycleOperation.updateMany({
        where: { userId, completedAt: null },
        data: { nextAttemptAt: new Date(), lastErrorCode: null },
      });
    });
    return this.get(userId);
  }
}

import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentsService } from '../consents/consents.service';
type Client = PrismaService | Prisma.TransactionClient;
@Injectable()
export class AbilityPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
  ) {}
  async enabledAreas(userId: string, db: Client = this.prisma) {
    const selection = await db.userSportSelection.findUnique({
      where: { userId },
      include: { sport: true, specialization: true },
    });
    if (!selection?.sport.isActive || !selection.specialization.isActive)
      return [];
    // No fallback to unrelated areas when the sport has no enabled drivers.
    const prompts = await db.sportSpecializationAreaPrompt.findMany({
      where: {
        specializationId: selection.specializationId,
        isActive: true,
        isEnabledDriver: true,
      },
      select: {
        isScheduled: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: { area: { name: 'asc' } },
    });
    return prompts.map((p) => ({ ...p.area, isScheduled: p.isScheduled }));
  }
  async assertEligible(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { onboardingAssessment: true, performanceGoal: true },
    });
    if (
      !user?.isActive ||
      user.role !== 'USER' ||
      user.onboardingAssessment?.status !== 'COMPLETED' ||
      !user.performanceGoal?.goalText
    )
      throw new ConflictException({
        code: 'ONBOARDING_REQUIRED',
        message: 'Completa prima il profilo iniziale',
      });
    if ((await this.consents.status(userId)).required)
      throw new ConflictException({
        code: 'REQUIRED_CONSENTS_MISSING',
        message: 'Accetta i consensi correnti',
      });
  }
  async enqueueAll(
    tx: Prisma.TransactionClient,
    userId: string,
    actorId = userId,
  ) {
    const mode = process.env.ABILITY_APPROVAL_MODE ?? 'AUTO';
    if (!['AUTO', 'MANUAL'].includes(mode))
      throw new Error('ABILITY_APPROVAL_MODE must be AUTO or MANUAL');
    for (const area of await this.enabledAreas(userId, tx)) {
      // Le aree a calendario si accodano per finestra, dopo la pubblicazione sportiva.
      if (area.isScheduled) continue;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ability:${userId}:${area.id}`}))`;
      const latest = await tx.improvementPlanRelease.findFirst({
        where: { userId, areaId: area.id },
        orderBy: { version: 'desc' },
      });
      // Existing active or review plans keep their content and approval policy.
      if (latest && ['ACTIVE', 'PENDING_APPROVAL'].includes(latest.status))
        continue;
      if (latest?.status === 'REJECTED') continue;
      const generationKey = `${userId}:${area.id}:${latest?.id ?? 'INITIAL'}`;
      const existing = await tx.abilityPlanOperation.findUnique({
        where: { generationKey },
      });
      if (existing) {
        if (!existing.completedAt)
          await tx.abilityPlanOperation.update({
            where: { id: existing.id },
            data: { nextAttemptAt: new Date() },
          });
      } else {
        const operation = await tx.abilityPlanOperation.create({
          data: {
            userId,
            areaId: area.id,
            generationKey,
            approvalMode: mode,
            requestedById: actorId,
          },
        });
        await tx.cycleAuditLog.create({
          data: {
            userId,
            action: 'ABILITY_PLAN_REQUESTED',
            actorId,
            metadata: { areaId: area.id, abilityOperationId: operation.id },
          },
        });
      }
    }
  }
  /**
   * Accoda le aree a calendario sulla finestra appena pubblicata: una richiesta per
   * area e release sportiva, cosi un rinnovo non genera due volte lo stesso lavoro.
   */
  async enqueueScheduled(
    tx: Prisma.TransactionClient,
    userId: string,
    trainingReleaseId: string,
    actorId = userId,
  ) {
    const mode = process.env.ABILITY_APPROVAL_MODE ?? 'AUTO';
    if (!['AUTO', 'MANUAL'].includes(mode))
      throw new Error('ABILITY_APPROVAL_MODE must be AUTO or MANUAL');
    for (const area of await this.enabledAreas(userId, tx)) {
      if (!area.isScheduled) continue;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ability:${userId}:${area.id}`}))`;
      const existing = await tx.improvementPlanRelease.findFirst({
        where: { userId, areaId: area.id, trainingReleaseId },
        select: { id: true },
      });
      if (existing) continue;
      const generationKey = `${userId}:${area.id}:window:${trainingReleaseId}`;
      const operation = await tx.abilityPlanOperation.findUnique({
        where: { generationKey },
      });
      if (operation) {
        if (!operation.completedAt)
          await tx.abilityPlanOperation.update({
            where: { id: operation.id },
            data: { nextAttemptAt: new Date() },
          });
        continue;
      }
      const created = await tx.abilityPlanOperation.create({
        data: {
          userId,
          areaId: area.id,
          generationKey,
          trainingReleaseId,
          approvalMode: mode,
          requestedById: actorId,
        },
      });
      await tx.cycleAuditLog.create({
        data: {
          userId,
          action: 'AREA_SCHEDULE_REQUESTED',
          actorId,
          metadata: {
            areaId: area.id,
            abilityOperationId: created.id,
            trainingReleaseId,
          },
        },
      });
    }
  }
  async request(userId: string) {
    await this.assertEligible(userId);
    if (!(await this.enabledAreas(userId)).length)
      throw new ConflictException({
        code: 'ABILITIES_NOT_CONFIGURED',
        message: 'Le abilità del tuo sport devono essere configurate',
      });
    await this.prisma.$transaction((tx) => this.enqueueAll(tx, userId));
    return this.current(userId);
  }
  async current(userId: string) {
    const areas = await this.enabledAreas(userId);
    return {
      abilities: await Promise.all(
        areas.map(async (area) => {
          const [plan, operation] = await Promise.all([
            this.prisma.improvementPlanRelease.findFirst({
              where: { userId, areaId: area.id },
              orderBy: { version: 'desc' },
              include: {
                items: {
                  select: { id: true, title: true, body: true, status: true },
                },
                questionSets: { select: { id: true, status: true } },
                sessions: {
                  select: { id: true, scheduledDate: true, status: true },
                  orderBy: { scheduledDate: 'asc' },
                },
              },
            }),
            this.prisma.abilityPlanOperation.findFirst({
              where: { userId, areaId: area.id },
              orderBy: { createdAt: 'desc' },
            }),
          ]);
          const status =
            plan?.status === 'ACTIVE'
              ? 'READY'
              : plan?.status === 'PENDING_APPROVAL'
                ? operation?.releaseId === plan.id &&
                  operation.approvalMode === 'AUTO'
                  ? operation.lastErrorCode
                    ? 'ERROR'
                    : 'PREPARING'
                  : 'REVIEW'
                : operation && !operation.completedAt
                  ? operation.lastErrorCode
                    ? 'ERROR'
                    : 'PREPARING'
                  : plan?.status === 'REJECTED'
                    ? 'REJECTED'
                    : plan
                      ? 'COMPLETED'
                      : 'EMPTY';
          return {
            ...area,
            status,
            retryScheduled:
              !!operation &&
              !operation.completedAt &&
              !!operation.lastErrorCode,
            errorCode: operation?.lastErrorCode ?? null,
            plan:
              plan && ['ACTIVE', 'CLOSED'].includes(plan.status)
                ? {
                    id: plan.id,
                    version: plan.version,
                    items: plan.items,
                    checkInId:
                      plan.questionSets.find((q) => q.status === 'PUBLISHED')
                        ?.id ?? null,
                    window: plan.startsOn
                      ? {
                          startsOn: plan.startsOn.toISOString().slice(0, 10),
                          endsOn:
                            plan.endsOn?.toISOString().slice(0, 10) ?? null,
                          sessions: plan.sessions.length,
                          completed: plan.sessions.filter(
                            (s) => s.status === 'COMPLETED',
                          ).length,
                          nextDate:
                            plan.sessions
                              .find((s) => s.status === 'SCHEDULED')
                              ?.scheduledDate.toISOString()
                              .slice(0, 10) ?? null,
                        }
                      : null,
                  }
                : null,
          };
        }),
      ),
    };
  }
}

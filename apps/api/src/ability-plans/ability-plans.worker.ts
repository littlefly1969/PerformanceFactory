import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  HttpException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { prepareCycleProposalInput } from '../ai-orchestrator/cycle-generation';
import {
  generateAreaScheduleProposal,
  prepareAreaScheduleInput,
} from '../ai-orchestrator/area-schedule';
import { persistAreaProposal } from '../ai-orchestrator/cycle-persistence';
import { publishCycle } from '../ai-orchestrator/cycle-publication';
import { AbilityPlansService } from './ability-plans.service';
import { assignAbilityProfessional } from './ability-assignment';
@Injectable()
export class AbilityPlansWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private readonly logger = new Logger(AbilityPlansWorker.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: AbilityPlansService,
    private readonly provider: AiProposalProviderService,
  ) {}
  onApplicationBootstrap() {
    if (
      !['AUTO', 'MANUAL'].includes(process.env.ABILITY_APPROVAL_MODE ?? 'AUTO')
    )
      throw new Error('ABILITY_APPROVAL_MODE must be AUTO or MANUAL');
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.ABILITY_PLANS_WORKER === 'false'
    )
      return;
    this.timer = setInterval(() => {
      void this.drain().catch((e) =>
        this.logger.error(
          e instanceof Error ? e.message : 'Ability worker failed',
        ),
      );
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      const operations = await this.prisma.abilityPlanOperation.findMany({
        where: {
          completedAt: null,
          nextAttemptAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        take: 12,
        select: { id: true },
      });
      // Bound external concurrency; a failure never cancels sibling areas.
      for (let i = 0; i < operations.length; i += 2)
        await Promise.all(
          operations.slice(i, i + 2).map((o) => this.resume(o.id)),
        );
    } finally {
      this.draining = false;
    }
  }
  async resume(id: string) {
    const token = randomUUID();
    const claim = await this.prisma.abilityPlanOperation.updateMany({
      where: {
        id,
        completedAt: null,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(Date.now() + 90000),
        attempts: { increment: 1 },
      },
    });
    if (!claim.count) return;
    const heartbeat = setInterval(() => {
      void this.prisma.abilityPlanOperation
        .updateMany({
          where: { id, leaseToken: token },
          data: { leaseUntil: new Date(Date.now() + 90000) },
        })
        .catch(() => {});
    }, 10000);
    heartbeat.unref();
    try {
      const op = await this.prisma.abilityPlanOperation.findUniqueOrThrow({
        where: { id },
      });
      await this.plans.assertEligible(op.userId);
      const area = (await this.plans.enabledAreas(op.userId)).find(
        (a) => a.id === op.areaId,
      );
      if (!area)
        throw new ConflictException({
          code: 'ABILITY_DISABLED',
          message: 'Abilità non più abilitata',
        });
      await assignAbilityProfessional(this.prisma, op.userId, op.areaId);
      let releaseId = op.releaseId;
      if (!releaseId) {
        // A manual proposal may have appeared after this command was queued. Preserve its policy.
        const existing = await this.prisma.improvementPlanRelease.findFirst({
          where: {
            userId: op.userId,
            areaId: op.areaId,
            status: { in: ['ACTIVE', 'PENDING_APPROVAL'] },
            // Una finestra nuova non eredita la release della precedente.
            ...(op.trainingReleaseId
              ? { trainingReleaseId: op.trainingReleaseId }
              : {}),
          },
        });
        if (existing) {
          await this.finish(id, token);
          return;
        }
        // L'area a calendario usa il proprio contratto: sedute datate nei giorni liberi.
        const scheduled = op.trainingReleaseId
          ? await prepareAreaScheduleInput(
              this.prisma,
              this.provider,
              op.userId,
              area,
              op.trainingReleaseId,
              'Sedute di area per la finestra sportiva corrente',
            )
          : null;
        const proposal = scheduled
          ? await generateAreaScheduleProposal(this.logger, scheduled)
          : await this.provider.generateCycleProposal(
              await prepareCycleProposalInput(
                this.prisma,
                this.provider,
                op.userId,
                area,
                'Piano iniziale o successivo per abilità, richiesto dall’atleta',
              ),
            );
        if (
          !proposal.planItems?.length ||
          (!scheduled && proposal.planItems.length > 3) ||
          !proposal.questions?.length
        )
          throw new ConflictException({
            code: 'INVALID_AI_OUTPUT',
            message: 'Proposta abilità non valida',
          });
        releaseId = (
          await persistAreaProposal(
            this.prisma,
            op.userId,
            area,
            op.requestedById,
            proposal,
            { id, leaseToken: token, approvalMode: op.approvalMode },
            scheduled
              ? {
                  ...scheduled.areaWindow,
                  trainingReleaseId: op.trainingReleaseId!,
                }
              : undefined,
          )
        ).planReleaseId;
      }
      let plan = await this.prisma.improvementPlanRelease.findUniqueOrThrow({
        where: { id: releaseId },
      });
      if (['ACTIVE', 'CLOSED', 'REJECTED'].includes(plan.status)) {
        await this.finish(id, token);
        return;
      }
      if (op.approvalMode === 'AUTO') {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ability:${op.userId}:${op.areaId}`}))`;
          const owned = await tx.abilityPlanOperation.findFirst({
            where: { id, leaseToken: token, leaseUntil: { gt: new Date() } },
          });
          if (!owned)
            throw new ConflictException({
              code: 'LEASE_LOST',
              message: 'Lease scaduta',
            });
          const current = await tx.improvementPlanRelease.findUniqueOrThrow({
            where: { id: releaseId },
          });
          if (current.status !== 'PENDING_APPROVAL') return;
          const rejected = await tx.planItem.count({
            where: { planReleaseId: releaseId, status: 'REJECTED' },
          });
          const rejectedApproval = await tx.questionSetAreaApproval.count({
            where: {
              questionSet: { planReleaseId: releaseId },
              status: 'REJECTED',
            },
          });
          if (rejected || rejectedApproval)
            throw new ConflictException({
              code: 'REVIEW_REJECTED',
              message: 'Proposta rifiutata',
            });
          if (current.approvalSource === 'SYSTEM') return;
          const now = new Date();
          await tx.planItem.updateMany({
            where: { planReleaseId: releaseId, status: 'PROPOSED' },
            data: {
              status: 'APPROVED',
              approvedByProfessionalId: null,
              approvedAt: now,
            },
          });
          await tx.questionSetAreaApproval.updateMany({
            where: {
              questionSet: { planReleaseId: releaseId },
              status: 'PENDING',
            },
            data: {
              status: 'APPROVED',
              approvedByProfessionalId: null,
              approvedAt: now,
            },
          });
          await tx.improvementPlanRelease.update({
            where: { id: releaseId },
            data: {
              approvalSource: 'SYSTEM',
              approvedAt: now,
              cycleStatus: 'READY_TO_PUBLISH',
            },
          });
          await tx.cycleAuditLog.create({
            data: {
              userId: op.userId,
              planReleaseId: releaseId,
              action: 'ABILITY_AUTO_APPROVED',
              source: 'SYSTEM',
              metadata: { abilityOperationId: id },
            },
          });
        });
        plan = await this.prisma.improvementPlanRelease.findUniqueOrThrow({
          where: { id: releaseId },
        });
        if (plan.status === 'PENDING_APPROVAL')
          await publishCycle(this.prisma, releaseId, null, true);
        await this.finish(id, token);
      } else {
        await this.prisma.abilityPlanOperation.updateMany({
          where: { id, leaseToken: token },
          data: {
            leaseToken: null,
            leaseUntil: null,
            lastErrorCode: null,
            nextAttemptAt: new Date(Date.now() + 60000),
          },
        });
      }
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : null;
      const code =
        response && typeof response === 'object' && 'code' in response
          ? String(response.code)
          : 'ABILITY_GENERATION_FAILED';
      const op = await this.prisma.abilityPlanOperation.findUniqueOrThrow({
        where: { id },
      });
      await this.prisma.abilityPlanOperation.updateMany({
        where: { id, leaseToken: token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          lastErrorCode: code,
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(300000, 15000 * 2 ** Math.min(op.attempts - 1, 5)),
          ),
        },
      });
      this.logger.warn(`Ability operation ${id}: ${code}; retry scheduled`);
    } finally {
      clearInterval(heartbeat);
    }
  }
  private async finish(id: string, leaseToken: string) {
    await this.prisma.abilityPlanOperation.updateMany({
      where: { id, leaseToken },
      data: {
        completedAt: new Date(),
        leaseToken: null,
        leaseUntil: null,
        lastErrorCode: null,
      },
    });
  }
}

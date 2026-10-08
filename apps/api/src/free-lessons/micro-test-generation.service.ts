import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { loadActiveAssessmentPrompt } from '../ai-orchestrator/assessment-prompts';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { requireAiConsent } from '../discovery/assessment-evaluation';
import { CalibrationService } from '../discovery/calibration/calibration.service';
import { FeatureFlagsService } from '../features/feature-flags.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  canClaimGeneration,
  MICRO_TEST_GENERATION as G,
  microTestTargets,
} from './free-lesson-rules';

/**
 * Micro-test scritti dall'AI per l'atleta, uno per driver poco affidabile, a
 * ogni nuova valutazione. Una sola chiamata AI per lotto anche con richieste
 * parallele (riga unica per atleta e valutazione, token e lease); se l'AI
 * fallisce o il flag è spento resta il catalogo del back office.
 */
@Injectable()
export class MicroTestGenerationService {
  private readonly logger = new Logger(MicroTestGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProposalProviderService,
    private readonly calibration: CalibrationService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private async latestEvaluation(userId: string) {
    return this.prisma.assessmentEvaluation.findFirst({
      where: { userId },
      orderBy: { sequence: 'desc' },
      select: {
        id: true,
        areas: {
          select: {
            areaId: true,
            score: true,
            confidence: true,
            evidenceGaps: true,
          },
        },
      },
    });
  }

  /** Il pannello chiede il lotto solo quando serve: flag, consenso AI, lotto da fare. */
  async shouldGenerate(userId: string, now = new Date()) {
    if (!(await this.flags.isEnabled('ai_micro_tests', userId))) return false;
    try {
      await requireAiConsent(this.prisma, userId);
    } catch {
      return false;
    }
    const latest = await this.latestEvaluation(userId);
    if (!latest) return false;
    const row = await this.prisma.microTestGeneration.findUnique({
      where: { userId_evaluationId: { userId, evaluationId: latest.id } },
      select: { status: true, attempts: true, claimedAt: true },
    });
    return canClaimGeneration(row, now);
  }

  /**
   * Genera il lotto per l'ultima valutazione, se nessun altro lo sta già
   * facendo. Non lancia sugli errori dell'AI: il lotto resta FAILED e
   * riprovabile, l'atleta vede intanto il catalogo.
   */
  async generate(userId: string, now = new Date()) {
    if (!(await this.flags.isEnabled('ai_micro_tests', userId))) return;
    await requireAiConsent(this.prisma, userId);
    const latest = await this.latestEvaluation(userId);
    if (!latest) return;
    await this.prisma.microTestGeneration.createMany({
      data: [{ userId, evaluationId: latest.id }],
      skipDuplicates: true,
    });
    const token = randomUUID();
    const claimed = await this.prisma.microTestGeneration.updateMany({
      where: {
        userId,
        evaluationId: latest.id,
        attempts: { lt: G.maxAttempts },
        OR: [
          { status: 'PENDING' },
          {
            status: 'RUNNING',
            claimedAt: { lt: new Date(now.getTime() - G.leaseMs) },
          },
          {
            status: 'FAILED',
            claimedAt: { lt: new Date(now.getTime() - G.retryAfterMs) },
          },
        ],
      },
      data: {
        status: 'RUNNING',
        token,
        claimedAt: now,
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const where = { userId, evaluationId: latest.id, token };
    try {
      const prompt = await loadActiveAssessmentPrompt(
        this.prisma,
        'MICRO_TEST',
      );
      const input = await this.input(userId, latest.areas);
      if (!input.targets.length) throw new Error('Nessun driver da coprire');
      const result = await this.ai.generateMicroTests({
        ...input,
        basePrompt: prompt.basePrompt,
        promptVersionId: prompt.promptVersionId,
      });
      await this.prisma.$transaction(async (tx) => {
        const generation = await tx.microTestGeneration.findFirst({
          where: { ...where, status: 'RUNNING' },
          select: { id: true },
        });
        // Lease perso: un'altra richiesta ha ripreso il lotto, questo esito si scarta.
        if (!generation) return;
        const done = await tx.microTestGeneration.updateMany({
          where: { id: generation.id, token, status: 'RUNNING' },
          data: {
            status: 'READY',
            token: null,
            provider: result.provider,
            model: result.model,
            promptVersionId: prompt.promptVersionId,
            promptHash: result.promptHash,
            error: null,
          },
        });
        if (!done.count) return;
        await tx.microTest.createMany({
          data: result.tests.map((t) => ({
            areaId: t.areaId,
            title: t.title,
            instructions: t.instructions,
            optionsJson: t.options,
            userId,
            generationId: generation.id,
          })),
        });
      });
    } catch (error) {
      this.logger.warn(
        `MICRO_TEST_GENERATION_FAILED: ${(error as Error).message}`,
      );
      await this.prisma.microTestGeneration.updateMany({
        where: { ...where, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          token: null,
          error: (error as Error).message.slice(0, 500),
        },
      });
    }
  }

  /** Input senza dati identificativi: profilo, driver bersaglio, storia, test già proposti. */
  private async input(
    userId: string,
    areas: Array<{
      areaId: string;
      score: number;
      confidence: number;
      evidenceGaps: unknown;
    }>,
  ) {
    const [history, proposed] = await Promise.all([
      this.calibration.athleteHistory(userId),
      this.prisma.microTest.findMany({
        where: {
          OR: [{ userId }, { completions: { some: { userId } } }],
        },
        orderBy: { createdAt: 'desc' },
        take: G.proposedTitles,
        select: { title: true },
      }),
    ]);
    const targets = microTestTargets(areas, G.targets).flatMap((area) => {
      const driver = history.drivers.find((d) => d.areaId === area.areaId);
      if (!driver) return [];
      return [
        {
          areaId: area.areaId,
          name: driver.name,
          score: area.score,
          confidence: area.confidence,
          evidenceGaps: area.evidenceGaps as string[],
          evidence: driver.answers
            .slice(-G.evidencePerDriver)
            .map(({ question, answer, source }) => ({
              source: source ?? 'ASSESSMENT',
              question,
              answer,
            })),
        },
      ];
    });
    return {
      scale: history.scale,
      athleteContext: history.athleteContext,
      targets,
      proposedTitles: proposed.map((p) => p.title),
    };
  }
}

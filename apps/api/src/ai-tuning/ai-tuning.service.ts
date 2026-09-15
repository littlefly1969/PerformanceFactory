import { Injectable, Logger } from '@nestjs/common';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationRunDto } from './dto/create-evaluation-run.dto';
import { RateEvaluationResultDto } from './dto/rate-evaluation-result.dto';
import { RunReplayDto } from './dto/run-replay.dto';
import { SaveReplayFeedbackDto } from './dto/save-replay-feedback.dto';
import { TestPromptDto } from './dto/test-prompt.dto';
import { UpsertGoldenContextDto } from './dto/upsert-golden-context.dto';
import { exportActivePrompts } from './prompt-export';
import {
  getAuditDetail,
  getCostSummary,
  listAudits,
  pseudonymizeUserId,
} from './tuning-audits';
import {
  createGoldenContext,
  createGoldenContextFromAudit,
  deleteGoldenContext,
  listAreaConfigs,
  listAreas,
  listGoldenContexts,
  listPromptVersions,
  updateGoldenContext,
} from './tuning-catalog';
import {
  createEvaluationRun,
  getEvaluationRun,
  listEvaluationRuns,
  rateEvaluationResult,
} from './tuning-evaluations';
import {
  getReplay,
  listReplays,
  runReplay,
  saveReplayFeedback,
  testPrompt,
} from './tuning-replays';
export * from './ai-tuning-model';

@Injectable()
export class AiTuningService {
  private readonly logger = new Logger(AiTuningService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalProvider: AiProposalProviderService,
  ) {}
  pseudonymizeUserId(userId: string): string {
    return pseudonymizeUserId(userId);
  }

  async listAreas() {
    return listAreas(this.prisma);
  }

  async listAreaConfigs() {
    return listAreaConfigs(this.prisma);
  }

  async listPromptVersions(params: { type?: string; ownerId?: string }) {
    return listPromptVersions(this.prisma, params);
  }

  async exportActivePrompts(now = new Date()) {
    return exportActivePrompts(this.prisma, now);
  }

  async listAudits(params: {
    areaId?: string;
    page?: number;
    provider?: string;
  }) {
    return listAudits(this.prisma, params);
  }

  async getAuditDetail(auditId: string) {
    return getAuditDetail(this.prisma, auditId);
  }

  async testPrompt(dto: TestPromptDto) {
    return testPrompt(this.proposalProvider, dto);
  }

  async runReplay(actorId: string, dto: RunReplayDto) {
    return runReplay(this.prisma, this.proposalProvider, actorId, dto);
  }

  async listReplays(actorId: string, page = 1) {
    return listReplays(this.prisma, actorId, page);
  }

  async getReplay(actorId: string, replayId: string) {
    return getReplay(this.prisma, actorId, replayId);
  }

  async saveReplayFeedback(
    actorId: string,
    replayId: string,
    dto: SaveReplayFeedbackDto,
  ) {
    return saveReplayFeedback(this.prisma, actorId, replayId, dto);
  }

  async listGoldenContexts(areaId?: string) {
    return listGoldenContexts(this.prisma, areaId);
  }

  async createGoldenContext(actorId: string, dto: UpsertGoldenContextDto) {
    return createGoldenContext(this.prisma, actorId, dto);
  }

  async updateGoldenContext(id: string, dto: UpsertGoldenContextDto) {
    return updateGoldenContext(this.prisma, id, dto);
  }

  async deleteGoldenContext(id: string) {
    return deleteGoldenContext(this.prisma, id);
  }

  async createGoldenContextFromAudit(
    actorId: string,
    auditId: string,
    label: string,
  ) {
    return createGoldenContextFromAudit(this.prisma, actorId, auditId, label);
  }

  async listEvaluationRuns() {
    return listEvaluationRuns(this.prisma);
  }

  async getEvaluationRun(runId: string) {
    return getEvaluationRun(this.prisma, runId);
  }

  async createEvaluationRun(actorId: string, dto: CreateEvaluationRunDto) {
    return createEvaluationRun(
      this.prisma,
      this.logger,
      this.proposalProvider,
      actorId,
      dto,
    );
  }

  async rateEvaluationResult(
    actorId: string,
    resultId: string,
    dto: RateEvaluationResultDto,
  ) {
    return rateEvaluationResult(this.prisma, actorId, resultId, dto);
  }

  async getCostSummary(params: { from?: Date; to?: Date }) {
    return getCostSummary(this.prisma, params);
  }
}

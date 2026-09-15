import { Injectable } from '@nestjs/common';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  getAiSettings,
  upsertAiAreaGenerationConfig,
  upsertGoalPromptConfig,
} from './admin-ai-settings';
import {
  deleteAthleteCompletely,
  rejectUserApplication,
  resetUserOperationalData,
  setUserActive,
} from './admin-athletes';
import { getDashboard } from './admin-dashboard';
import {
  deleteOnboardingTemplate,
  upsertOnboardingTemplate,
} from './admin-onboarding';
import { deleteSport, upsertSportCatalog } from './admin-sports';
import { UpsertAiAreaGenerationConfigDto } from './dto/upsert-ai-area-generation-config.dto';
import { UpsertGoalPromptConfigDto } from './dto/upsert-goal-prompt-config.dto';
import { UpsertOnboardingTemplateDto } from './dto/upsert-onboarding-template.dto';
export * from './admin-model';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}
  async getDashboard() {
    return getDashboard(this.prisma);
  }

  async setUserActive(userId: string, isActive: boolean) {
    return setUserActive(this.prisma, userId, isActive);
  }

  async rejectUserApplication(userId: string) {
    return rejectUserApplication(this.prisma, userId);
  }

  async resetUserOperationalData(userId: string) {
    return resetUserOperationalData(this.prisma, userId);
  }

  async deleteAthleteCompletely(userId: string) {
    return deleteAthleteCompletely(this.prisma, userId);
  }

  async getAiSettings() {
    return getAiSettings(this.prisma);
  }

  async upsertGoalPromptConfig(
    body: UpsertGoalPromptConfigDto,
    actorId: string,
  ) {
    return upsertGoalPromptConfig(this.prisma, body, actorId);
  }

  async upsertSportCatalog(
    body: {
      id?: string;
      key?: string;
      label?: string;
      isActive?: boolean;
      specializations?: Array<{
        id?: string;
        key?: string;
        label?: string;
        trainingPrompt?: string;
        trainingPromptActive?: boolean;
        isActive?: boolean;
        prompts?: Array<{
          id?: string;
          areaId?: string;
          basePrompt?: string;
          isEnabledDriver?: boolean;
          isActive?: boolean;
        }>;
      }>;
    },
    actorId: string,
  ) {
    return upsertSportCatalog(this.prisma, body, actorId);
  }

  async deleteSport(sportId: string) {
    return deleteSport(this.prisma, sportId);
  }

  async upsertAiAreaGenerationConfig(
    body: UpsertAiAreaGenerationConfigDto,
    actorId: string,
  ) {
    return upsertAiAreaGenerationConfig(this.prisma, body, actorId);
  }

  async upsertOnboardingTemplate(
    body: UpsertOnboardingTemplateDto,
    actorId: string,
  ) {
    return upsertOnboardingTemplate(this.prisma, body, actorId);
  }

  async deleteOnboardingTemplate(id: string) {
    return deleteOnboardingTemplate(this.prisma, id);
  }
}

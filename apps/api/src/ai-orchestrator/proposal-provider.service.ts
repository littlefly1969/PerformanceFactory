import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export type AiScaleConfig = {
  minScore: number;
  maxScore: number;
  potentialStep: number;
  thresholdRatio: number;
};

export type AiAreaInput = {
  id: string;
  name: string;
};

export type AiSnapshotInput = {
  id: string;
  rankingGlobal: number;
  reason: string;
  createdAt: Date;
  areas: Array<{
    areaId: string;
    realR: number;
    potentialP: number;
    area: { id: string; name: string };
  }>;
} | null;

export type AiCycleContext = {
  athlete: {
    performanceGoal?: string | null;
    generalAnamnesis: unknown;
    targetAreaAnamnesis: unknown;
    areaLevel: string;
  };
  targetArea: {
    name: string;
  };
  cycle: {
    nextVersion: number;
  };
  performance: {
    latestSnapshot: null | {
      rankingGlobal: number;
      targetArea: null | {
        realR: number;
        potentialP: number;
        gap: number;
      };
      otherAreas: Array<{
        areaName: string;
        realR: number;
        potentialP: number;
        gap: number;
      }>;
    };
  };
  history: {
    olderCyclesSummary: {
      scope: 'AREA' | 'TRAINING';
      targetLabel: string;
      summaryText: string;
      summaryJson: unknown;
      coveredVersions: number[];
      updatedAt: string;
    } | null;
    previousAreaCycles: Array<{
      version: number;
      status: string;
      cycleStatus: string;
      exercises: Array<{
        title: string;
        body: string;
        status: string;
        completionRating: number | null;
        completionNotes: string | null;
        rejectionReason: string | null;
      }>;
      questionnaires: Array<{
        status: string;
        rejectionReasons: string[];
        questions: Array<{
          text: string;
          answers: Array<{
            scoreAwarded: number;
            optionLabel: string | null;
          }>;
        }>;
      }>;
    }>;
  };
  guidance: {
    areaGenerationConfig: {
      initialContext: string;
      responseFormatPrompt: string;
      questionnaireLayoutJson: unknown;
    } | null;
    userAreaPromptInstruction: {
      promptVersion: string;
      updatedAt: string;
      basePrompt: string;
    } | null;
    sportSpecializationPromptInstruction: {
      sportLabel: string;
      specializationLabel: string;
      areaName: string;
      version: number;
      updatedAt: string;
      basePrompt: string;
    } | null;
    trainingPromptInstruction: {
      sportLabel: string;
      specializationLabel: string;
      version: number;
      updatedAt: string;
      basePrompt: string;
    } | null;
    planItemRequirements: string[];
    questionnaireRequirements: string[];
    safetyRules: string[];
  };
};

export type CycleProposalInput = {
  userId: string;
  area: AiAreaInput;
  nextVersion: number;
  reason: string;
  scale: AiScaleConfig;
  previousSnapshot: AiSnapshotInput;
  context: AiCycleContext;
};

export type AiProvider = 'stub' | 'openai' | 'gemini';

export type CycleProposal = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  summaryText: string;
  audit: {
    status: 'SUCCESS';
    inputJson: Record<string, unknown>;
    outputJson: Record<string, unknown>;
    latencyMs: number;
  };
  planItems: Array<{
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>;
  questions: Array<{
    text: string;
    objectiveRef?: string;
    orderIndex: number;
    options: Array<{ label: string; score: number }>;
  }>;
};

export type CycleHistorySummaryInput = {
  userId: string;
  scope: 'AREA' | 'TRAINING';
  targetLabel: string;
  coveredCycles: unknown[];
};

export type CycleHistorySummaryResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  summaryText: string;
  summaryJson: Record<string, unknown>;
  inputJson: Record<string, unknown>;
  outputJson: Record<string, unknown>;
  latencyMs: number;
};

type CycleQuestionLayout = {
  questions: number;
  answerOptions: Array<{ label: string; score: number }>;
  raw: unknown;
};

export type GoalValidationInput = {
  userId: string;
  goalText: string;
  basePrompt: string;
  areas: AiAreaInput[];
  sportSelection?: {
    sportId: string;
    sportKey: string;
    sportLabel: string;
    specializationId: string;
    specializationKey: string;
    specializationLabel: string;
    label: string;
  };
  sportSpecializationPromptInstructions?: Array<{
    sportKey: string;
    specializationKey: string;
    specializationId: string;
    sportLabel: string;
    areaId: string;
    areaName: string;
    basePrompt: string;
    version: number;
  }>;
  onboardingProfile?: unknown;
  onboardingAnswers?: unknown;
  refinementContext?: {
    originalGoal: string;
    currentDraft: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    userReply: string;
  };
};

export type GoalValidationStatus =
  | 'OK'
  | 'NEEDS_ANAMNESIS'
  | 'GOAL_NEEDS_REFORMULATION'
  | 'OUT_OF_SCOPE'
  | 'UNSAFE';

export type GoalValidationResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  status: GoalValidationStatus;
  accepted: boolean;
  interpretedGoal: string;
  userMessage: string;
  suggestedReformulatedGoal: string | null;
  questionsToUser: string[];
  normalizedGoal: Record<string, unknown> | null;
  goalEvaluation: Record<string, unknown>;
  nextStep: string;
  rejectionReason: string | null;
  areaPrompts: Array<{
    areaId: string;
    areaName: string;
    promptText: string;
  }>;
};

export type SpecialistOnboardingQuestionInput = {
  userId: string;
  goalText: string;
  interpretedGoal: string;
  normalizedGoal?: unknown;
  sportSelection?: {
    sportId: string;
    sportKey: string;
    sportLabel: string;
    specializationId: string;
    specializationKey: string;
    specializationLabel: string;
    label: string;
  };
  sportSpecializationPromptInstructions?: Array<{
    sportKey: string;
    specializationKey: string;
    specializationId: string;
    sportLabel: string;
    areaId: string;
    areaName: string;
    basePrompt: string;
    version: number;
  }>;
  generalProfile: unknown;
  generalAnswers: unknown;
  areas: AiAreaInput[];
};

export type SpecialistOnboardingQuestionResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  areaQuestions: Array<{
    areaId: string;
    areaName: string;
    questions: Array<{ text: string; orderIndex: number }>;
  }>;
};

const PROMPT_VERSION = 'cycle-proposal-v2';
const GOAL_VALIDATION_VERSION = 'goal-validation-v1';
const SPECIALIST_ONBOARDING_QUESTIONS_VERSION =
  'specialist-onboarding-questions-v1';
const HISTORY_SUMMARY_VERSION = 'cycle-history-summary-v1';
const QUESTIONS_PER_AREA = 3;
const EXTERNAL_AI_PROVIDERS: AiProvider[] = ['openai', 'gemini'];
const SYSTEM_PROMPT =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e le domande di monitoraggio richieste dal layout AI usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';
const DEFAULT_OPTIONS = [
  { label: 'Non ancora', score: 0 },
  { label: 'A volte', score: 50 },
  { label: 'Spesso', score: 75 },
  { label: 'Con costanza', score: 100 },
];

@Injectable()
export class AiProposalProviderService {
  private readonly logger = new Logger(AiProposalProviderService.name);

  async generateCycleProposal(
    input: CycleProposalInput,
  ): Promise<CycleProposal> {
    const startedAt = Date.now();
    const inputJson = this.buildAuditInput(input);
    const provider = this.resolveProvider();
    if (provider === 'openai') {
      return this.generateOpenAiProposal(input, inputJson, startedAt);
    }
    if (provider === 'gemini') {
      return this.generateGeminiProposal(input, inputJson, startedAt);
    }
    return this.generateStubProposal(input, inputJson, startedAt);
  }

  async summarizeCycleHistory(
    input: CycleHistorySummaryInput,
  ): Promise<CycleHistorySummaryResult> {
    const startedAt = Date.now();
    const provider = this.resolveProvider();
    const model = this.resolveModel(provider);
    const inputJson = this.buildHistorySummaryAuditInput(input);
    if (provider === 'openai') {
      return this.summarizeOpenAiCycleHistory(input, inputJson, startedAt);
    }
    if (provider === 'gemini') {
      return this.summarizeGeminiCycleHistory(input, inputJson, startedAt);
    }
    return this.normalizeHistorySummary(
      provider,
      model,
      {
        summaryText: `Storico sintetico ${input.targetLabel}: ${input.coveredCycles.length} cicli precedenti oltre agli ultimi tre.`,
        stableSignals: [],
        completedWork: [],
        unresolvedRisks: [],
        progressionNotes: [],
      },
      inputJson,
      startedAt,
    );
  }

  buildCycleProposalPreview(input: CycleProposalInput) {
    const provider = this.resolveProvider();
    const inputJson = this.buildAuditInput(input);
    return {
      provider,
      model: this.resolveModel(provider),
      promptVersion: PROMPT_VERSION,
      promptHash: this.hashJson(inputJson),
      inputJson,
    };
  }

  async validatePerformanceGoal(
    input: GoalValidationInput,
  ): Promise<GoalValidationResult> {
    const provider = this.resolveProvider();
    const model = this.resolveModel(provider);
    const inputJson = this.buildGoalValidationAuditInput(input);
    if (provider === 'openai') {
      return this.validateOpenAiPerformanceGoal(input, inputJson);
    }
    if (provider === 'gemini') {
      return this.validateGeminiPerformanceGoal(input, inputJson);
    }
    return this.normalizeGoalValidation(
      input,
      provider,
      model,
      this.buildStubGoalValidation(input),
      inputJson,
    );
  }

  async generateSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
  ): Promise<SpecialistOnboardingQuestionResult> {
    const provider = this.resolveProvider();
    const model = this.resolveModel(provider);
    const inputJson = this.buildSpecialistOnboardingQuestionAuditInput(input);
    if (provider === 'openai') {
      return this.generateOpenAiSpecialistOnboardingQuestions(input, inputJson);
    }
    if (provider === 'gemini') {
      return this.generateGeminiSpecialistOnboardingQuestions(input, inputJson);
    }
    return this.normalizeSpecialistOnboardingQuestions(
      input,
      provider,
      model,
      this.buildStubSpecialistOnboardingQuestions(input),
      inputJson,
    );
  }

  static requiresUserConsent(provider = process.env.AI_PROVIDER ?? 'stub') {
    return EXTERNAL_AI_PROVIDERS.includes(provider.toLowerCase() as AiProvider);
  }

  private resolveProvider(): AiProvider {
    const provider = (process.env.AI_PROVIDER ?? 'stub').toLowerCase();
    if (provider === 'stub' || provider === 'openai' || provider === 'gemini') {
      return provider;
    }
    throw new BadRequestException(`AI_PROVIDER non supportato: ${provider}`);
  }

  private generateStubProposal(
    input: CycleProposalInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): CycleProposal {
    const questionLayout = this.cycleQuestionLayout(input);
    const proposal = {
      provider: 'stub',
      model: 'deterministic-stub',
      promptVersion: PROMPT_VERSION,
      promptHash: this.hashJson(inputJson),
      summaryText: input.reason || 'Ciclo AI generato',
      planItems: [
        {
          type: 'FOCUS',
          title: `Focus ${input.area.name}`,
          body: `Attivita generata automaticamente per ${input.area.name}.`,
          metadata: {
            source: 'orchestrator',
            area: input.area.name,
            provider: 'stub',
          },
        },
      ],
      questions: Array.from({ length: questionLayout.questions }, (_, index) => ({
        text: `${input.area.name}: verifica ${index + 1}`,
        objectiveRef: `area:${input.area.id}`,
        orderIndex: index + 1,
        options: questionLayout.answerOptions,
      })),
    } satisfies Omit<CycleProposal, 'audit'>;

    return {
      ...proposal,
      audit: {
        status: 'SUCCESS',
        inputJson,
        outputJson: this.buildAuditOutput(proposal),
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private async generateOpenAiProposal(
    input: CycleProposalInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): Promise<CycleProposal> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
      );
    }

    const model = this.resolveModel('openai');
    this.logDebugPrompt('openai', model, inputJson);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: this.buildSystemPrompt(input),
          },
          {
            role: 'user',
            content: JSON.stringify(this.buildProposalPrompt(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'performance_cycle_proposal',
            strict: true,
            schema: this.buildProposalJsonSchema(input),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Proposta OpenAI non riuscita: ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .find((text): text is string => !!text);

    if (!outputText) {
      throw new BadRequestException('La risposta proposta OpenAI e vuota');
    }

    const parsed = this.parseProposalJson(outputText, 'OpenAI');

    return this.normalizeProposal(
      input,
      'openai',
      model,
      parsed,
      inputJson,
      startedAt,
    );
  }

  private async generateGeminiProposal(
    input: CycleProposalInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): Promise<CycleProposal> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
      );
    }

    const model = this.resolveModel('gemini');
    this.logDebugPrompt('gemini', model, inputJson);
    const modelName = model.startsWith('models/')
      ? model.slice('models/'.length)
      : model;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: this.buildSystemPrompt(input) }],
          },
          contents: [
            {
              role: 'user',
              parts: [
                { text: JSON.stringify(this.buildProposalPrompt(input)) },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: this.buildProposalJsonSchema(input, {
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Proposta Gemini non riuscita: ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
      promptFeedback?: { blockReason?: string };
    };
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => !!text)
      .join('');

    if (!outputText) {
      const reason =
        payload.promptFeedback?.blockReason ??
        payload.candidates?.[0]?.finishReason ??
        'risposta vuota';
      throw new BadRequestException(
        `La risposta proposta Gemini e vuota: ${reason}`,
      );
    }

    const parsed = this.parseProposalJson(outputText, 'Gemini');

    return this.normalizeProposal(
      input,
      'gemini',
      model,
      parsed,
      inputJson,
      startedAt,
    );
  }

  private async summarizeOpenAiCycleHistory(
    input: CycleHistorySummaryInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): Promise<CycleHistorySummaryResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
      );
    }

    const model = this.resolveModel('openai');
    this.logDebugPrompt('openai', model, inputJson);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Riassumi lo storico atleta per uso tecnico in prompt futuri. Rispondi solo con JSON valido, in italiano, senza inventare dati non presenti.',
          },
          {
            role: 'user',
            content: JSON.stringify(this.buildHistorySummaryPrompt(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'cycle_history_summary',
            strict: true,
            schema: this.buildHistorySummaryJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Sunto storico OpenAI non riuscito: ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .find((text): text is string => !!text);
    if (!outputText) {
      throw new BadRequestException('La risposta sunto storico OpenAI e vuota');
    }

    return this.normalizeHistorySummary(
      'openai',
      model,
      this.parseHistorySummaryJson(outputText, 'OpenAI'),
      inputJson,
      startedAt,
    );
  }

  private async summarizeGeminiCycleHistory(
    input: CycleHistorySummaryInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): Promise<CycleHistorySummaryResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
      );
    }

    const model = this.resolveModel('gemini');
    this.logDebugPrompt('gemini', model, inputJson);
    const modelName = model.startsWith('models/')
      ? model.slice('models/'.length)
      : model;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  'Riassumi lo storico atleta per uso tecnico in prompt futuri. Rispondi solo con JSON valido, in italiano, senza inventare dati non presenti.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: JSON.stringify(this.buildHistorySummaryPrompt(input)) }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: this.buildHistorySummaryJsonSchema({
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Sunto storico Gemini non riuscito: ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => !!text)
      .join('');
    if (!outputText) {
      throw new BadRequestException(
        `La risposta sunto storico Gemini e vuota: ${
          payload.promptFeedback?.blockReason ?? 'risposta vuota'
        }`,
      );
    }

    return this.normalizeHistorySummary(
      'gemini',
      model,
      this.parseHistorySummaryJson(outputText, 'Gemini'),
      inputJson,
      startedAt,
    );
  }

  private async generateOpenAiSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
    inputJson: Record<string, unknown>,
  ): Promise<SpecialistOnboardingQuestionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
      );
    }

    const model = this.resolveModel('openai');
    this.logDebugPrompt('openai', model, inputJson);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content:
              'Genera domande anamnestiche specialistiche per sport performance. Rispondi solo con JSON valido, in italiano, senza diagnosi o prescrizioni cliniche.',
          },
          {
            role: 'user',
            content: JSON.stringify(
              this.buildSpecialistOnboardingQuestionTask(input),
            ),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'specialist_onboarding_questions',
            strict: true,
            schema: this.buildSpecialistOnboardingQuestionJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Domande specialistiche OpenAI non riuscite: ${errorText}`,
      );
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .find((text): text is string => !!text);
    if (!outputText) {
      throw new BadRequestException(
        'La risposta domande specialistiche OpenAI e vuota',
      );
    }

    return this.normalizeSpecialistOnboardingQuestions(
      input,
      'openai',
      model,
      this.parseSpecialistOnboardingQuestionJson(outputText, 'OpenAI'),
      inputJson,
    );
  }

  private async validateOpenAiPerformanceGoal(
    input: GoalValidationInput,
    inputJson: Record<string, unknown>,
  ): Promise<GoalValidationResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY e obbligatoria per AI_PROVIDER=openai',
      );
    }

    const model = this.resolveModel('openai');
    this.logDebugPrompt('openai', model, inputJson);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: input.basePrompt },
          {
            role: 'user',
            content: JSON.stringify(this.buildGoalValidationTask(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'goal_validation',
            strict: true,
            schema: this.buildGoalValidationJsonSchema(input),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Validazione obiettivo OpenAI non riuscita: ${errorText}`);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .find((text): text is string => !!text);
    if (!outputText) {
      throw new BadRequestException('La risposta validazione obiettivo OpenAI e vuota');
    }
    return this.normalizeGoalValidation(
      input,
      'openai',
      model,
      this.parseGoalValidationJson(outputText, 'OpenAI'),
      inputJson,
    );
  }

  private async generateGeminiSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
    inputJson: Record<string, unknown>,
  ): Promise<SpecialistOnboardingQuestionResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
      );
    }

    const model = this.resolveModel('gemini');
    this.logDebugPrompt('gemini', model, inputJson);
    const modelName = model.startsWith('models/')
      ? model.slice('models/'.length)
      : model;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  'Genera domande anamnestiche specialistiche per sport performance. Rispondi solo con JSON valido, in italiano, senza diagnosi o prescrizioni cliniche.',
              },
            ],
          },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: JSON.stringify(
                    this.buildSpecialistOnboardingQuestionTask(input),
                  ),
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema:
              this.buildSpecialistOnboardingQuestionJsonSchema({
                includePropertyOrdering: true,
              }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(
        `Domande specialistiche Gemini non riuscite: ${errorText}`,
      );
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => !!text)
      .join('');
    if (!outputText) {
      throw new BadRequestException(
        `La risposta domande specialistiche Gemini e vuota: ${
          payload.promptFeedback?.blockReason ?? 'risposta vuota'
        }`,
      );
    }

    return this.normalizeSpecialistOnboardingQuestions(
      input,
      'gemini',
      model,
      this.parseSpecialistOnboardingQuestionJson(outputText, 'Gemini'),
      inputJson,
    );
  }

  private async validateGeminiPerformanceGoal(
    input: GoalValidationInput,
    inputJson: Record<string, unknown>,
  ): Promise<GoalValidationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY e obbligatoria per AI_PROVIDER=gemini',
      );
    }

    const model = this.resolveModel('gemini');
    this.logDebugPrompt('gemini', model, inputJson);
    const modelName = model.startsWith('models/')
      ? model.slice('models/'.length)
      : model;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.basePrompt }] },
          contents: [
            {
              role: 'user',
              parts: [
                { text: JSON.stringify(this.buildGoalValidationTask(input)) },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: this.buildGoalValidationJsonSchema(input, {
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Validazione obiettivo Gemini non riuscita: ${errorText}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const outputText = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => !!text)
      .join('');
    if (!outputText) {
      throw new BadRequestException(
        `La risposta validazione obiettivo Gemini e vuota: ${
          payload.promptFeedback?.blockReason ?? 'risposta vuota'
        }`,
      );
    }
    return this.normalizeGoalValidation(
      input,
      'gemini',
      model,
      this.parseGoalValidationJson(outputText, 'Gemini'),
      inputJson,
    );
  }

  private normalizeProposal(
    input: CycleProposalInput,
    provider: AiProvider,
    model: string,
    parsed: {
      summaryText?: string;
      planItems?: Array<{ type?: string; title?: string; body?: string }>;
      questions?: Array<{
        text?: string;
        objectiveRef?: string;
        orderIndex?: number;
      }>;
    },
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): CycleProposal {
    const questionLayout = this.cycleQuestionLayout(input);
    const planItems = (parsed.planItems ?? [])
      .filter((item) => item.title && item.body)
      .slice(0, 3)
      .map((item) => ({
        type: item.type || 'FOCUS',
        title: item.title || `Focus ${input.area.name}`,
        body:
          item.body ||
          `Rivedere gli obiettivi di performance dell'area ${input.area.name}.`,
        metadata: {
          source: 'orchestrator',
          area: input.area.name,
          provider,
          model,
          promptVersion: PROMPT_VERSION,
        },
      }));

    const questions = (parsed.questions ?? [])
      .filter((question) => question.text)
      .slice(0, questionLayout.questions)
      .map((question, index) => ({
        text: question.text || `${input.area.name}: verifica ${index + 1}`,
        objectiveRef: question.objectiveRef || `area:${input.area.id}`,
        orderIndex: question.orderIndex || index + 1,
        options: questionLayout.answerOptions,
      }));

    if (planItems.length === 0 || questions.length !== questionLayout.questions) {
      throw new BadRequestException(`Validazione proposta ${provider} non riuscita`);
    }

    const proposal = {
      provider,
      model,
      promptVersion: PROMPT_VERSION,
      promptHash: this.hashJson(inputJson),
      summaryText: parsed.summaryText || input.reason || 'Ciclo AI generato',
      planItems,
      questions,
    } satisfies Omit<CycleProposal, 'audit'>;

    return {
      ...proposal,
      audit: {
        status: 'SUCCESS',
        inputJson,
        outputJson: this.buildAuditOutput(proposal),
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private buildProposalPrompt(input: CycleProposalInput) {
    const areaGenerationConfig = input.context.guidance.areaGenerationConfig;
    const questionLayout = this.cycleQuestionLayout(input);
    return {
      task: `Genera una proposta di lavoro specifica per area e ${questionLayout.questions} domande di valutazione basate sul contesto atleta fornito.`,
      constraints: {
        questions: questionLayout.questions,
        answerOptions: questionLayout.answerOptions,
        responseFormat:
          areaGenerationConfig?.responseFormatPrompt ??
          'Usa il formato JSON richiesto dallo schema tecnico.',
        questionnaireLayout: questionLayout.raw,
        questionnaireLayoutSource:
          'Contesto e layout AI della configurazione area; numero domande e opzioni risposta sono vincolanti.',
        scoreRange: {
          min: input.scale.minScore,
          max: input.scale.maxScore,
        },
        areaIndependentCycle: true,
        humanReviewRequired: true,
        language: 'Italiano',
        planItems: {
          minItems: 1,
          maxItems: 3,
          mustInclude:
            'azione chiara, frequenza o trigger, criterio di successo misurabile e indicazione di progressione',
        },
        questionsMustMeasure:
          'esecuzione osservabile o aderenza al lavoro generato per l area target',
      },
      context: this.buildModelContext(input.context),
    };
  }

  private buildHistorySummaryPrompt(input: CycleHistorySummaryInput) {
    return {
      task:
        'Produci un sunto tecnico dei cicli storici piu vecchi, da aggiungere ai prompt futuri senza sostituire gli ultimi tre cicli completi.',
      scope: input.scope,
      targetLabel: input.targetLabel,
      coveredCycles: input.coveredCycles,
      rules: [
        'Usa solo i dati presenti nei cicli forniti.',
        'Non inventare diagnosi, metriche, ritmi, frequenze o vincoli mancanti.',
        'Conserva solo informazioni utili a generare il prossimo lavoro: cosa e stato assegnato, completato, rifiutato, feedback, punteggi, segnali di rischio e progressione.',
        'Distingui fatti osservati da inferenze prudenti.',
        'Il testo deve essere sintetico ma operativo per il prossimo prompt AI.',
      ],
      outputShape:
        'Restituisci summaryText e liste stableSignals, completedWork, unresolvedRisks, progressionNotes.',
    };
  }

  private buildSpecialistOnboardingQuestionTask(
    input: SpecialistOnboardingQuestionInput,
  ) {
    return {
      task:
        'Genera esattamente tre domande anamnestiche specialistiche per ciascuna area ufficiale. Le domande saranno mostrate all atleta dopo l anamnesi generale.',
      language: 'Italiano',
      athleteGoal: input.goalText,
      interpretedGoal: input.interpretedGoal,
      normalizedGoal: input.normalizedGoal ?? null,
      sportSelection: input.sportSelection ?? null,
      sportSpecializationPromptInstructions:
        input.sportSpecializationPromptInstructions?.map((instruction) => ({
          sport: instruction.sportLabel,
          areaName: instruction.areaName,
          version: instruction.version,
          basePrompt: instruction.basePrompt,
        })) ?? [],
      generalProfile: input.generalProfile,
      generalAnswers: input.generalAnswers,
      areas: input.areas,
      constraints: {
        questionsPerArea: QUESTIONS_PER_AREA,
        questionType:
          'Domande SCORE a risposta su scala numerica 1-5. Il testo puo indicare chiaramente che la risposta va data da 1 a 5.',
        answerScale:
          'Scala 1-5: 1 = molto basso o molto critico, 2 = fragile, 3 = sufficiente/stabile, 4 = buono/forte, 5 = eccellente.',
        numericQuestionWording:
          'Ogni domanda deve essere valutabile con un numero da 1 a 5. Usa formule come "Quanto...", "In che misura...", "Quanto ritieni..." o "Quanto e presente...". Non usare domande aperte come "Quali sono...", "Descrivi...", "Elenca..." o "Spiega...", perche l atleta non avra un campo testuale.',
        personalization:
          'Ogni domanda deve essere coerente con obiettivo, dati generali e atleta specifico; non usare domande generiche uguali per tutti.',
        realismCheck:
          'Le risposte devono dare all AI dati sufficienti per capire alla validazione finale se l obiettivo e realistico rispetto a sport scelto, anamnesi generale, baseline per area e vincoli dichiarati.',
        areaSpecificity:
          'Ogni domanda deve citare o riflettere chiaramente il lavoro della propria area, evitando duplicazioni tra aree.',
        avoid: [
          'diagnosi mediche',
          'prescrizioni cliniche',
          'richieste di dati non necessari',
          'promesse di risultato',
          'domande gia presenti nell anamnesi generale',
        ],
      },
      outputShape:
        'Restituisci areaQuestions: array con areaId e questions. Ogni questions contiene tre oggetti con text e orderIndex 1..3.',
    };
  }

  private buildGoalValidationTask(input: GoalValidationInput) {
    const finalValidation = Boolean(input.onboardingProfile || input.onboardingAnswers);
    return {
      task: 'Valida l obiettivo iniziale Performance Factory e, solo se status=OK, genera prompt specialistici per le aree abilitate.',
      evaluationPhase: finalValidation
        ? 'VALIDAZIONE_FINALE_DOPO_ANAMNESI'
        : 'BOZZA_OBIETTIVO_PRIMA_DELL_ANAMNESI',
      platformPrinciple:
        'Performance Factory promuove il miglioramento personale rispetto al punto di partenza, non il confronto tossico con gli altri.',
      officialAreas: input.areas.map((area) => area.name),
      athleteGoal: input.goalText,
      sportSelection: input.sportSelection ?? null,
      sportSpecializationPromptInstructions:
        input.sportSpecializationPromptInstructions?.map((instruction) => ({
          sport: instruction.sportLabel,
          areaName: instruction.areaName,
          version: instruction.version,
          basePrompt: instruction.basePrompt,
        })) ?? [],
      refinementContext: input.refinementContext ?? null,
      datiAnamnestici: input.onboardingProfile ?? null,
      storicoRisposte: input.onboardingAnswers ?? null,
      availableAreas: input.areas,
      statuses: [
        'OK',
        'NEEDS_ANAMNESIS',
        'GOAL_NEEDS_REFORMULATION',
        'OUT_OF_SCOPE',
        'UNSAFE',
      ],
      decisionRules: {
        OK: finalValidation
          ? 'Obiettivo sportivo/performance, chiaro, sicuro, personale, misurabile e realistico rispetto a sport scelto, anamnesi generale, risposte specialistiche e baseline dichiarata.'
          : 'Obiettivo sportivo/performance, chiaro, sicuro, personale e misurabile nei suoi elementi essenziali. Non servono ancora frequenza di allenamento, dieta, abitudini o anamnesi: quei dati arrivano dopo nei questionari.',
        NEEDS_ANAMNESIS:
          'Usalo solo se l obiettivo cita dolore, trauma, patologie, sintomi o rischio concreto che richiede dati personali prima di procedere.',
        GOAL_NEEDS_REFORMULATION:
          'Obiettivo potenzialmente coerente ma troppo vago, generico, non misurabile, senza sport/attivita, senza risultato desiderato o troppo orientato a battere altri.',
        OUT_OF_SCOPE:
          'Obiettivo non collegato a sport, performance, benessere funzionale o miglioramento personale.',
        UNSAFE:
          'Obiettivo rischioso, illecito, clinicamente improprio, doping, restrizioni estreme o ignora dolore/trauma/sintomi.',
      },
      healthLimits: [
        'Nutrizione: solo educazione sportiva generale, idratazione, timing, recupero, energia disponibile; niente diete cliniche, grammature obbligatorie, farmaci o gestione DCA.',
        'Fisioterapia: prevenzione, mobilita, recupero e monitoraggio prudente; niente diagnosi o protocolli terapeutici.',
        'Per dolore acuto, trauma, sintomi neurologici, dolore toracico, svenimenti, disturbi alimentari, patologie note o farmaci, suggerire valutazione professionale.',
      ],
      outputRules: [
        'Rispondi solo in JSON valido.',
        'Il campo status governa il flusso.',
        'Se refinementContext e presente, conserva le parti gia utili dell obiettivo originale e della bozza corrente, integra solo le nuove risposte dell utente e non chiedere di riscrivere tutto.',
        finalValidation
          ? 'La fase corrente serve a validare definitivamente obiettivo e realismo, non a generare ancora l allenamento.'
          : 'La fase corrente serve SOLO a definire l obiettivo, non a fare anamnesi, onboarding, allenamento o questionario sulle abitudini.',
        finalValidation
          ? 'Questa e la validazione finale: usa datiAnamnestici e storicoRisposte per decidere se l obiettivo e realistico. Se non lo e, usa GOAL_NEEDS_REFORMULATION e spiega cosa va ridimensionato o chiarito.'
          : 'Questa non e la validazione finale: se mancano dati personali ma l obiettivo e sensato, usa NEEDS_ANAMNESIS.',
        'Se mancano informazioni, fai al massimo 3 domande specifiche e brevi in questions_to_user, riferite solo a: sport/attivita, risultato concreto desiderato, criterio di misura, orizzonte temporale, punto di partenza espresso come prestazione attuale.',
        'La scelta sportiva dell atleta e vincolante: non chiedere quale sport pratica se sportSelection e presente; usa quella selezione per valutare pertinenza e generare prompt area.',
        'Integra i prompt sportSpecializationPromptInstructions nei prompt area finali: ogni area deve riflettere sport, specializzazione e istruzioni amministrative specifiche.',
        'Non chiedere quante volte si allena, quanto spesso si allena, quanto mangia, cosa mangia, dieta, sonno, stress, disponibilita settimanale, attrezzatura, infortuni o dettagli sul metodo per raggiungere l obiettivo. Questi dati appartengono ai questionari successivi.',
        'Se l obiettivo e gia comprensibile ma mancano dettagli sul metodo o sulle abitudini, considera status=OK e lascia che i questionari raccolgano quei dati.',
        'Se status diverso da OK, area_prompts deve avere tutti i valori null.',
        'Se status OK, compila tutti i prompt delle aree abilitate in availableAreas.',
        'Ogni prompt area deve essere utilizzabile da un modulo AI specialistico e contenere role, objective, required_inputs, initial_questionnaire, exercise_generation_rules, feedback_questions, progression_rules, measurement_indicators, safety_limits, output_format.',
      ],
    };
  }

  private buildGoalValidationJsonSchema(
    input: GoalValidationInput,
    options?: {
      includePropertyOrdering?: boolean;
    },
  ) {
    const goalEvaluationSchema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'original_goal',
        'is_sport_related',
        'is_self_improvement_oriented',
        'is_clear',
        'is_measurable',
        'is_safe',
        'is_legal',
        'main_issues',
        'reasoning_summary',
      ],
      properties: {
        original_goal: { type: 'string' },
        is_sport_related: { type: 'boolean' },
        is_self_improvement_oriented: { type: 'boolean' },
        is_clear: { type: 'boolean' },
        is_measurable: { type: 'boolean' },
        is_safe: { type: 'boolean' },
        is_legal: { type: 'boolean' },
        main_issues: { type: 'array', items: { type: 'string' } },
        reasoning_summary: { type: 'string' },
      },
    };
    const normalizedGoalSchema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'sport_or_activity',
        'performance_dimension',
        'current_level_assumption',
        'desired_improvement',
        'time_horizon',
        'measurement_criteria',
        'constraints_to_check',
      ],
      properties: {
        sport_or_activity: { type: ['string', 'null'] },
        performance_dimension: { type: ['string', 'null'] },
        current_level_assumption: { type: ['string', 'null'] },
        desired_improvement: { type: ['string', 'null'] },
        time_horizon: { type: ['string', 'null'] },
        measurement_criteria: { type: 'array', items: { type: 'string' } },
        constraints_to_check: { type: 'array', items: { type: 'string' } },
      },
    };
    const areaPromptSchema = {
      type: 'object',
      additionalProperties: false,
      required: [
        'role',
        'objective',
        'required_inputs',
        'initial_questionnaire',
        'exercise_generation_rules',
        'feedback_questions',
        'progression_rules',
        'measurement_indicators',
        'safety_limits',
        'output_format',
      ],
      properties: {
        role: { type: 'string' },
        objective: { type: 'string' },
        required_inputs: { type: 'array', items: { type: 'string' } },
        initial_questionnaire: { type: 'array', items: { type: 'string' } },
        exercise_generation_rules: { type: 'array', items: { type: 'string' } },
        feedback_questions: { type: 'array', items: { type: 'string' } },
        progression_rules: { type: 'array', items: { type: 'string' } },
        measurement_indicators: { type: 'array', items: { type: 'string' } },
        safety_limits: { type: 'array', items: { type: 'string' } },
        output_format: {
          type: 'object',
          additionalProperties: false,
          properties: {},
        },
      },
    };
    const nullableAreaPromptSchema = {
      anyOf: [areaPromptSchema, { type: 'null' }],
    };
    const areaPromptKeys = Array.from(
      new Set(input.areas.map((area) => this.areaPromptKey(area.name))),
    );
    const areaPromptProperties = Object.fromEntries(
      areaPromptKeys.map((key) => [key, nullableAreaPromptSchema]),
    );
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'status',
        'goal_evaluation',
        'message_to_user',
        'suggested_reformulated_goal',
        'questions_to_user',
        'normalized_goal',
        'area_prompts',
        'next_step',
      ],
      properties: {
        status: {
          type: 'string',
          enum: [
            'OK',
            'NEEDS_ANAMNESIS',
            'GOAL_NEEDS_REFORMULATION',
            'OUT_OF_SCOPE',
            'UNSAFE',
          ],
        },
        goal_evaluation: goalEvaluationSchema,
        message_to_user: { type: 'string' },
        suggested_reformulated_goal: { type: ['string', 'null'] },
        questions_to_user: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 5,
        },
        normalized_goal: normalizedGoalSchema,
        area_prompts: {
          type: 'object',
          additionalProperties: false,
          required: areaPromptKeys,
          properties: areaPromptProperties,
        },
        next_step: { type: 'string' },
      },
      ...(options?.includePropertyOrdering
        ? {
            propertyOrdering: [
              'status',
              'goal_evaluation',
              'message_to_user',
              'suggested_reformulated_goal',
              'questions_to_user',
              'normalized_goal',
              'area_prompts',
              'next_step',
            ],
          }
        : {}),
    };
  }

  private buildSpecialistOnboardingQuestionJsonSchema(options?: {
    includePropertyOrdering?: boolean;
  }) {
    const questionSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'orderIndex'],
      properties: {
        text: { type: 'string' },
        orderIndex: { type: 'integer', minimum: 1, maximum: 3 },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['text', 'orderIndex'] }
        : {}),
    };
    const areaSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['areaId', 'questions'],
      properties: {
        areaId: { type: 'string' },
        questions: {
          type: 'array',
          minItems: QUESTIONS_PER_AREA,
          maxItems: QUESTIONS_PER_AREA,
          items: questionSchema,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['areaId', 'questions'] }
        : {}),
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['areaQuestions'],
      properties: {
        areaQuestions: {
          type: 'array',
          minItems: 1,
          items: areaSchema,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['areaQuestions'] }
        : {}),
    };
  }

  private buildModelContext(context: AiCycleContext) {
    const { guidance: _guidance, ...modelContext } = context;
    void _guidance;
    return modelContext;
  }

  private buildProposalJsonSchema(
    input: CycleProposalInput,
    options?: {
      includePropertyOrdering?: boolean;
    },
  ) {
    const questionLayout = this.cycleQuestionLayout(input);
    const planItemSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'title', 'body'],
      properties: {
        type: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['type', 'title', 'body'] }
        : {}),
    };

    const questionSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'objectiveRef', 'orderIndex'],
      properties: {
        text: { type: 'string' },
        objectiveRef: { type: 'string' },
        orderIndex: {
          type: 'integer',
          minimum: 1,
          maximum: questionLayout.questions,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['text', 'objectiveRef', 'orderIndex'] }
        : {}),
    };

    return {
      type: 'object',
      additionalProperties: false,
      required: ['summaryText', 'planItems', 'questions'],
      properties: {
        summaryText: { type: 'string' },
        planItems: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: planItemSchema,
        },
        questions: {
          type: 'array',
          minItems: questionLayout.questions,
          maxItems: questionLayout.questions,
          items: questionSchema,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['summaryText', 'planItems', 'questions'] }
        : {}),
    };
  }

  private buildHistorySummaryJsonSchema(options?: {
    includePropertyOrdering?: boolean;
  }) {
    const stringArraySchema = {
      type: 'array',
      items: { type: 'string' },
      maxItems: 12,
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'summaryText',
        'stableSignals',
        'completedWork',
        'unresolvedRisks',
        'progressionNotes',
      ],
      properties: {
        summaryText: { type: 'string' },
        stableSignals: stringArraySchema,
        completedWork: stringArraySchema,
        unresolvedRisks: stringArraySchema,
        progressionNotes: stringArraySchema,
      },
      ...(options?.includePropertyOrdering
        ? {
            propertyOrdering: [
              'summaryText',
              'stableSignals',
              'completedWork',
              'unresolvedRisks',
              'progressionNotes',
            ],
          }
        : {}),
    };
  }

  private cycleQuestionLayout(input: CycleProposalInput): CycleQuestionLayout {
    const raw = input.context.guidance.areaGenerationConfig?.questionnaireLayoutJson;
    const root =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const questionnaire =
      root.questionnaire &&
      typeof root.questionnaire === 'object' &&
      !Array.isArray(root.questionnaire)
        ? (root.questionnaire as Record<string, unknown>)
        : root;
    const rawQuestions = questionnaire.questions;
    const questions =
      typeof rawQuestions === 'number' &&
      Number.isInteger(rawQuestions) &&
      rawQuestions > 0
        ? Math.min(rawQuestions, 10)
        : QUESTIONS_PER_AREA;
    const rawOptions = questionnaire.answerOptions;
    const answerOptions = Array.isArray(rawOptions)
      ? rawOptions
          .map((option) => {
            if (!option || typeof option !== 'object' || Array.isArray(option)) {
              return null;
            }
            const item = option as Record<string, unknown>;
            const label =
              typeof item.label === 'string' ? item.label.trim() : '';
            const score =
              typeof item.score === 'number'
                ? item.score
                : typeof item.value === 'number'
                  ? item.value
                  : null;
            return label && score !== null ? { label, score } : null;
          })
          .filter(
            (option): option is { label: string; score: number } =>
              option !== null,
          )
      : [];
    return {
      questions,
      answerOptions: answerOptions.length ? answerOptions : DEFAULT_OPTIONS,
      raw: raw ?? null,
    };
  }

  private parseProposalJson(outputText: string, providerName: string) {
    try {
      return JSON.parse(outputText) as {
        summaryText?: string;
        planItems?: Array<{ type?: string; title?: string; body?: string }>;
        questions?: Array<{
          text?: string;
          objectiveRef?: string;
          orderIndex?: number;
        }>;
      };
    } catch {
      throw new BadRequestException(
        `La risposta proposta ${providerName} non e un JSON valido`,
      );
    }
  }

  private parseHistorySummaryJson(outputText: string, providerName: string) {
    try {
      return JSON.parse(outputText) as {
        summaryText?: string;
        stableSignals?: string[];
        completedWork?: string[];
        unresolvedRisks?: string[];
        progressionNotes?: string[];
      };
    } catch {
      throw new BadRequestException(
        `La risposta sunto storico ${providerName} non e un JSON valido`,
      );
    }
  }

  private normalizeHistorySummary(
    provider: AiProvider,
    model: string,
    parsed: {
      summaryText?: string;
      stableSignals?: string[];
      completedWork?: string[];
      unresolvedRisks?: string[];
      progressionNotes?: string[];
    },
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): CycleHistorySummaryResult {
    const summaryJson = {
      stableSignals: this.stringList(parsed.stableSignals),
      completedWork: this.stringList(parsed.completedWork),
      unresolvedRisks: this.stringList(parsed.unresolvedRisks),
      progressionNotes: this.stringList(parsed.progressionNotes),
    };
    const summaryText =
      parsed.summaryText?.trim() ||
      [
        ...summaryJson.stableSignals,
        ...summaryJson.completedWork,
        ...summaryJson.unresolvedRisks,
        ...summaryJson.progressionNotes,
      ].join('\n') ||
      'Nessun elemento storico sintetizzabile oltre agli ultimi tre cicli.';

    return {
      provider,
      model,
      promptVersion: HISTORY_SUMMARY_VERSION,
      promptHash: this.hashJson(inputJson),
      summaryText,
      summaryJson,
      inputJson,
      outputJson: { summaryText, ...summaryJson },
      latencyMs: Date.now() - startedAt,
    };
  }

  private stringList(value?: unknown) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 12)
      : [];
  }

  private parseSpecialistOnboardingQuestionJson(
    outputText: string,
    providerName: string,
  ) {
    try {
      return JSON.parse(outputText) as {
        areaQuestions?: Array<{
          areaId?: string;
          questions?: Array<{ text?: string; orderIndex?: number }>;
        }>;
      };
    } catch {
      throw new BadRequestException(
        `La risposta domande specialistiche ${providerName} non e un JSON valido`,
      );
    }
  }

  private parseGoalValidationJson(outputText: string, providerName: string) {
    try {
      return JSON.parse(outputText) as {
        status?: GoalValidationStatus;
        goal_evaluation?: Record<string, unknown>;
        message_to_user?: string;
        suggested_reformulated_goal?: string | null;
        questions_to_user?: string[];
        normalized_goal?: Record<string, unknown>;
        area_prompts?: Record<string, unknown>;
        next_step?: string;
      };
    } catch {
      throw new BadRequestException(
        `La risposta validazione obiettivo ${providerName} non e un JSON valido`,
      );
    }
  }

  private normalizeGoalValidation(
    input: GoalValidationInput,
    provider: AiProvider,
    model: string,
    parsed: {
      status?: GoalValidationStatus;
      goal_evaluation?: Record<string, unknown>;
      message_to_user?: string;
      suggested_reformulated_goal?: string | null;
      questions_to_user?: string[];
      normalized_goal?: Record<string, unknown>;
      area_prompts?: Record<string, unknown>;
      next_step?: string;
    },
    inputJson: Record<string, unknown>,
  ): GoalValidationResult {
    const status = this.normalizeGoalStatus(parsed.status);
    const accepted = status === 'OK';
    const goalEvaluation = parsed.goal_evaluation ?? {};
    const normalizedGoal = parsed.normalized_goal ?? {};
    const interpretedGoal =
      this.readNormalizedGoalText(normalizedGoal) ||
      (accepted
        ? `L obiettivo riguarda: ${input.goalText}`
        : 'Obiettivo non utilizzabile per il percorso.');
    const userMessage =
      parsed.message_to_user?.trim() ||
      (accepted
        ? `Ho capito questo obiettivo: ${interpretedGoal}`
        : 'Quanto richiesto non e consono a un percorso di performance sportiva.');
    const areaPrompts = accepted
      ? this.normalizeAreaPromptsFromValidation(input, parsed.area_prompts ?? {})
      : [];
    return {
      provider,
      model,
      promptVersion: GOAL_VALIDATION_VERSION,
      promptHash: this.hashJson(inputJson),
      inputJson,
      status,
      accepted,
      interpretedGoal,
      userMessage,
      suggestedReformulatedGoal: parsed.suggested_reformulated_goal ?? null,
      questionsToUser: this.normalizeGoalClarificationQuestions(
        parsed.questions_to_user,
      ),
      normalizedGoal,
      goalEvaluation,
      nextStep: parsed.next_step ?? (accepted ? 'Procedere con il percorso.' : 'Attendere nuovo obiettivo.'),
      rejectionReason: accepted
        ? null
        : parsed.suggested_reformulated_goal ||
          'Obiettivo non pertinente o non consono.',
      areaPrompts,
    };
  }

  private normalizeGoalStatus(status?: string): GoalValidationStatus {
    if (
      status === 'OK' ||
      status === 'NEEDS_ANAMNESIS' ||
      status === 'GOAL_NEEDS_REFORMULATION' ||
      status === 'OUT_OF_SCOPE' ||
      status === 'UNSAFE'
    ) {
      return status;
    }
    return 'GOAL_NEEDS_REFORMULATION';
  }

  private readNormalizedGoalText(normalizedGoal: Record<string, unknown>) {
    const sport = normalizedGoal.sport_or_activity;
    const improvement = normalizedGoal.desired_improvement;
    if (typeof sport === 'string' && typeof improvement === 'string') {
      return `${sport}: ${improvement}`;
    }
    if (typeof improvement === 'string') {
      return improvement;
    }
    return null;
  }

  private normalizeGoalClarificationQuestions(questions?: unknown) {
    if (!Array.isArray(questions)) {
      return [];
    }

    const forbiddenPattern =
      /\b(quante volte|quanto spesso|frequenza|giorni alla settimana|ore alla settimana|ti alleni|allenamenti|sessioni|mangi|mangiare|alimentazione|dieta|calorie|proteine|carboidrati|sonno|dormi|stress|attrezzatura|infortuni|dolore)\b/i;

    return questions
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !forbiddenPattern.test(item))
      .slice(0, 3);
  }

  private normalizeAreaPromptsFromValidation(
    input: GoalValidationInput,
    areaPrompts: Record<string, unknown>,
  ) {
    return input.areas.map((area) => {
      const key = this.areaPromptKey(area.name);
      const prompt = areaPrompts[key] ?? areaPrompts[this.fallbackAreaPromptKey(area.name)];
      return {
        areaId: area.id,
        areaName: area.name,
        promptText:
          prompt && typeof prompt === 'object'
            ? JSON.stringify(prompt)
            : this.buildFallbackGoalAreaPrompt(input.goalText, area.name),
      };
    });
  }

  private sportInstructionsForArea(
    input: GoalValidationInput,
    areaId: string,
  ) {
    const instructions =
      input.sportSpecializationPromptInstructions?.filter(
        (instruction) => instruction.areaId === areaId,
      ) ?? [];
    if (!instructions.length) {
      return input.sportSelection
        ? `Contesto sportivo selezionato dall atleta: ${input.sportSelection.label}.`
        : '';
    }
    return [
      input.sportSelection
        ? `Contesto sportivo selezionato dall atleta: ${input.sportSelection.label}.`
        : '',
      ...instructions.map(
        (instruction) =>
          `[Prompt sport ${instruction.sportLabel} v${instruction.version}]\n${instruction.basePrompt}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private areaPromptKey(areaName: string) {
    const normalized = areaName.toLowerCase();
    if (normalized.includes('athletic')) {
      return 'preparazione_atletica';
    }
    if (normalized.includes('equipment')) {
      return 'equipaggiamento';
    }
    if (normalized.includes('mental')) {
      return 'mental_training';
    }
    if (normalized.includes('nutrition')) {
      return 'nutrizione';
    }
    if (normalized.includes('physio')) {
      return 'fisioterapia';
    }
    if (normalized.includes('technical') || normalized.includes('tactical')) {
      return 'tecnico_tattica';
    }
    return this.fallbackAreaPromptKey(areaName);
  }

  private fallbackAreaPromptKey(areaName: string) {
    return areaName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private buildStubGoalValidation(input: GoalValidationInput) {
    const normalized = input.goalText.toLowerCase();
    const rejected =
      input.goalText.trim().length < 10 ||
      ['violenza', 'droga', 'doping', 'scommesse', 'soldi facili'].some(
        (term) => normalized.includes(term),
      );
    if (rejected) {
      return {
        status: 'UNSAFE' as GoalValidationStatus,
        goal_evaluation: {
          original_goal: input.goalText,
          is_sport_related: false,
          is_self_improvement_oriented: false,
          is_clear: false,
          is_measurable: false,
          is_safe: false,
          is_legal: false,
          main_issues: ['Obiettivo fuori tema o non sicuro'],
          reasoning_summary:
            'L obiettivo non e utilizzabile in un percorso Performance Factory.',
        },
        message_to_user:
          'Quanto richiesto non e consono a un percorso di performance sportiva.',
        suggested_reformulated_goal: null,
        questions_to_user: [],
        normalized_goal: {
          sport_or_activity: input.sportSelection?.label ?? null,
          performance_dimension: null,
          current_level_assumption: null,
          desired_improvement: null,
          time_horizon: null,
          measurement_criteria: [],
          constraints_to_check: [],
        },
        area_prompts: {},
        next_step: 'Attendere un nuovo obiettivo sicuro e pertinente.',
      };
    }
    const hasOnboarding = input.onboardingProfile || input.onboardingAnswers;
    return {
      status: (hasOnboarding ? 'OK' : 'NEEDS_ANAMNESIS') as GoalValidationStatus,
      goal_evaluation: {
        original_goal: input.goalText,
        is_sport_related: true,
        is_self_improvement_oriented: true,
        is_clear: true,
        is_measurable: true,
        is_safe: true,
        is_legal: true,
        main_issues: hasOnboarding ? [] : ['Mancano dati anamnestici'],
        reasoning_summary:
          'Obiettivo coerente con Performance Factory e orientato al miglioramento personale.',
      },
      message_to_user: hasOnboarding
        ? `Ho capito questo obiettivo: ${input.goalText.trim()}`
        : 'Obiettivo potenzialmente valido. Completa l anamnesi per personalizzare il percorso.',
      suggested_reformulated_goal: null,
      questions_to_user: hasOnboarding
        ? []
        : [
            'Qual e il tuo livello attuale?',
            'Hai limitazioni, dolori o infortuni da considerare?',
            'Quanto tempo puoi dedicare al percorso?',
          ],
      normalized_goal: {
        sport_or_activity: input.sportSelection?.label ?? null,
        performance_dimension: null,
        current_level_assumption: null,
        desired_improvement: input.goalText.trim(),
        time_horizon: null,
        measurement_criteria: [],
        constraints_to_check: [],
      },
      area_prompts: hasOnboarding
        ? Object.fromEntries(
            input.areas.map((area) => [
              this.areaPromptKey(area.name),
              {
                role: `Modulo ${area.name}`,
                objective: `Personalizzare il lavoro ${area.name} rispetto all obiettivo: ${input.goalText.trim()}${input.sportSelection ? ` nel contesto ${input.sportSelection.label}` : ''}`,
                required_inputs: ['obiettivo normalizzato', 'anamnesi', 'storico risposte'],
                initial_questionnaire: [],
                exercise_generation_rules: [
                  'Genera azioni concrete, misurabili e progressive.',
                ],
                feedback_questions: [],
                progression_rules: ['Progredisci in modo prudente.'],
                measurement_indicators: ['aderenza', 'qualita esecuzione', 'progresso percepito'],
                safety_limits: ['Non fare diagnosi o prescrizioni cliniche.'],
                output_format: {},
                sport_context: this.sportInstructionsForArea(input, area.id),
              },
            ]),
          )
        : {},
      next_step: hasOnboarding
        ? 'Congelare obiettivo e generare prompt area.'
        : 'Avviare anamnesi.',
    };
  }

  private normalizeSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
    provider: AiProvider,
    model: string,
    parsed: {
      areaQuestions?: Array<{
        areaId?: string;
        questions?: Array<{ text?: string; orderIndex?: number }>;
      }>;
    },
    inputJson: Record<string, unknown>,
  ): SpecialistOnboardingQuestionResult {
    const parsedByArea = new Map(
      (parsed.areaQuestions ?? [])
        .filter((item) => item.areaId)
        .map((item) => [item.areaId as string, item.questions ?? []]),
    );
    const areaQuestions = input.areas.map((area) => {
      const normalizedQuestions = (parsedByArea.get(area.id) ?? [])
        .filter((question) => question.text?.trim())
        .slice(0, QUESTIONS_PER_AREA)
        .map((question, index) => ({
          text: question.text!.trim(),
          orderIndex:
            typeof question.orderIndex === 'number'
              ? Math.max(1, Math.min(QUESTIONS_PER_AREA, question.orderIndex))
              : index + 1,
        }));
      const questions =
        normalizedQuestions.length === QUESTIONS_PER_AREA
          ? normalizedQuestions
          : this.buildFallbackSpecialistQuestions(input, area);
      return {
        areaId: area.id,
        areaName: area.name,
        questions,
      };
    });

    return {
      provider,
      model,
      promptVersion: SPECIALIST_ONBOARDING_QUESTIONS_VERSION,
      promptHash: this.hashJson(inputJson),
      inputJson,
      areaQuestions,
    };
  }

  private buildStubSpecialistOnboardingQuestions(
    input: SpecialistOnboardingQuestionInput,
  ) {
    return {
      areaQuestions: input.areas.map((area) => ({
        areaId: area.id,
        questions: this.buildFallbackSpecialistQuestions(input, area),
      })),
    };
  }

  private buildFallbackSpecialistQuestions(
    input: SpecialistOnboardingQuestionInput,
    area: AiAreaInput,
  ) {
    const goal = input.interpretedGoal || input.goalText;
    return [
      `Per ${area.name}, quanto il tuo livello attuale supporta l obiettivo: ${goal}?`,
      `Per ${area.name}, quanto sono chiari vincoli o difficolta che possono influenzare questo obiettivo?`,
      `Per ${area.name}, quanto riesci a mantenere continuita nelle azioni utili a questo obiettivo?`,
    ].map((text, index) => ({ text, orderIndex: index + 1 }));
  }

  private buildFallbackGoalAreaPrompt(goalText: string, areaName: string) {
    return [
      `Personalizza ogni proposta per l area ${areaName} rispetto all obiettivo dichiarato dall atleta: ${goalText}.`,
      'Prioritizza attivita pratiche, misurabili e progressive che avvicinano l atleta a questo obiettivo.',
      'Le domande di monitoraggio devono verificare aderenza ed esecuzione osservabile collegate all obiettivo.',
      'Mantieni il lavoro revisionabile da un professionista e non inventare diagnosi, dati o vincoli non presenti.',
    ].join(' ');
  }

  private logDebugPrompt(
    provider: AiProvider,
    model: string,
    inputJson: Record<string, unknown>,
  ) {
    if (process.env.AI_DEBUG_PROMPT_LOG !== 'true') {
      return;
    }

    this.logger.log(
      JSON.stringify({
        provider,
        model,
        prompt: inputJson.prompt,
      }),
    );
  }

  private buildAuditInput(input: CycleProposalInput) {
    const previousArea = input.previousSnapshot?.areas.find(
      (area) => area.areaId === input.area.id,
    );
    const providerPrompt = this.buildProposalPrompt(input);

    return {
      area: { name: input.area.name },
      nextVersion: input.nextVersion,
      reason: input.reason,
      previousSnapshot: input.previousSnapshot
        ? {
            rankingGlobal: input.previousSnapshot.rankingGlobal,
            reason: input.previousSnapshot.reason,
            createdAt: input.previousSnapshot.createdAt.toISOString(),
            area: previousArea
              ? {
                  realR: previousArea.realR,
                  potentialP: previousArea.potentialP,
                  areaName: previousArea.area.name,
                }
              : null,
          }
        : null,
      prompt: {
        system: this.buildSystemPrompt(input),
        user: providerPrompt,
        responseJsonSchema: this.buildProposalJsonSchema(input),
      },
    };
  }

  private buildHistorySummaryAuditInput(input: CycleHistorySummaryInput) {
    return {
      prompt: {
        system:
          'Riassumi storico atleta vecchio per prompt futuri, senza inventare dati.',
        user: this.buildHistorySummaryPrompt(input),
        responseJsonSchema: this.buildHistorySummaryJsonSchema(),
      },
    };
  }

  private buildSpecialistOnboardingQuestionAuditInput(
    input: SpecialistOnboardingQuestionInput,
  ) {
    return {
      prompt: {
        system:
          'Genera domande anamnestiche specialistiche personalizzate per area.',
        user: this.buildSpecialistOnboardingQuestionTask(input),
        responseJsonSchema: this.buildSpecialistOnboardingQuestionJsonSchema(),
      },
    };
  }

  private buildGoalValidationAuditInput(input: GoalValidationInput) {
    return {
      prompt: {
        system: input.basePrompt,
        user: this.buildGoalValidationTask(input),
        responseJsonSchema: this.buildGoalValidationJsonSchema(input),
      },
      sportSelection: input.sportSelection ?? null,
      sportSpecializationPromptInstructions: input.sportSpecializationPromptInstructions ?? [],
    };
  }

  private buildSystemPrompt(input: CycleProposalInput) {
    const basePrompt =
      input.context.guidance.areaGenerationConfig?.initialContext ??
      SYSTEM_PROMPT;
    const responseFormatPrompt =
      input.context.guidance.areaGenerationConfig?.responseFormatPrompt;
    const sections = [basePrompt];
    if (responseFormatPrompt) {
      sections.push(`Forma della risposta configurata:\n${responseFormatPrompt}`);
    }
    if (input.context.guidance.userAreaPromptInstruction) {
      sections.push(
        [
          'Prompt area personalizzato dell atleta:',
          this.stripEmbeddedSportPromptInstructions(
            input.context.guidance.userAreaPromptInstruction.basePrompt,
          ),
        ].join('\n'),
      );
    }
    if (input.context.guidance.sportSpecializationPromptInstruction) {
      const sportPrompt = input.context.guidance.sportSpecializationPromptInstruction;
      sections.push(
        [
          'Prompt sport-specializzazione corrente configurato dall amministratore. Questo prompt prevale su eventuali istruzioni sport vecchie presenti nello storico atleta.',
          `[${sportPrompt.sportLabel} - ${sportPrompt.specializationLabel} / ${sportPrompt.areaName} v${sportPrompt.version}]`,
          sportPrompt.basePrompt,
        ].join('\n'),
      );
    }
    if (input.context.guidance.trainingPromptInstruction) {
      const trainingPrompt = input.context.guidance.trainingPromptInstruction;
      sections.push(
        [
          'Prompt allenamento specifico corrente configurato dall amministratore.',
          `[Allenamento ${trainingPrompt.sportLabel} - ${trainingPrompt.specializationLabel} v${trainingPrompt.version}]`,
          trainingPrompt.basePrompt,
        ].join('\n'),
      );
    }
    return sections.join('\n\n');
  }

  private stripEmbeddedSportPromptInstructions(promptText: string) {
    return promptText
      .replace(/\n*\[Prompt sport [^\]]+\]\n[\s\S]*?(?=\n\n\{|$)/g, '')
      .trim();
  }

  private buildAuditOutput(proposal: Omit<CycleProposal, 'audit'>) {
    return {
      provider: proposal.provider,
      model: proposal.model,
      promptVersion: proposal.promptVersion,
      promptHash: proposal.promptHash,
      summaryText: proposal.summaryText,
      planItems: proposal.planItems,
      questions: proposal.questions,
    };
  }

  private hashJson(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private resolveModel(provider: AiProvider) {
    if (provider === 'openai') {
      return process.env.AI_MODEL_PROPOSAL ?? 'gpt-5.4-mini';
    }
    if (provider === 'gemini') {
      return process.env.GEMINI_MODEL_PROPOSAL ?? 'gemini-2.5-flash';
    }
    return 'deterministic-stub';
  }
}

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
    adminPromptInstructions: Array<{
      name: string;
      scope: string;
      athleteLevel: string;
      version: number;
      basePrompt: string;
    }>;
    userAreaPromptInstruction: {
      promptVersion: string;
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

export type GoalAreaPromptInput = {
  userId: string;
  goalText: string;
  basePrompt: string;
  areas: AiAreaInput[];
  onboardingProfile: unknown;
  onboardingAnswers: unknown;
};

export type GoalAreaPromptResult = {
  provider: AiProvider;
  model: string;
  promptVersion: string;
  promptHash: string;
  inputJson: Record<string, unknown>;
  areaPrompts: Array<{
    areaId: string;
    areaName: string;
    promptText: string;
  }>;
};

export type GoalValidationInput = {
  userId: string;
  goalText: string;
  basePrompt: string;
  areas: AiAreaInput[];
  onboardingProfile?: unknown;
  onboardingAnswers?: unknown;
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

const PROMPT_VERSION = 'cycle-proposal-v2';
const GOAL_PROMPT_VERSION = 'goal-area-prompts-v1';
const GOAL_VALIDATION_VERSION = 'goal-validation-v1';
const QUESTIONS_PER_AREA = 3;
const EXTERNAL_AI_PROVIDERS: AiProvider[] = ['openai', 'gemini'];
const SYSTEM_PROMPT =
  'Sei un assistente senior di sport performance a supporto di professionisti umani. Genera una proposta di miglioramento specifica per area e tre domande di monitoraggio usando solo il contesto atleta fornito. Rispondi esclusivamente in italiano e solo con JSON valido conforme allo schema. Il lavoro deve essere pratico, misurabile, progressivo e revisionabile da un professionista. Non inventare diagnosi, indicazioni mediche, dati atleta non presenti o contesto nascosto. Se esistono lavori precedenti, usa note di completamento, punteggi e motivi di rifiuto per migliorare la proposta.';
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

  async generateGoalAreaPrompts(
    input: GoalAreaPromptInput,
  ): Promise<GoalAreaPromptResult> {
    const provider = this.resolveProvider();
    const model = this.resolveModel(provider);
    const inputJson = this.buildGoalPromptAuditInput(input);
    if (provider === 'openai') {
      return this.generateOpenAiGoalAreaPrompts(input, inputJson);
    }
    if (provider === 'gemini') {
      return this.generateGeminiGoalAreaPrompts(input, inputJson);
    }
    return {
      provider,
      model,
      promptVersion: GOAL_PROMPT_VERSION,
      promptHash: this.hashJson(inputJson),
      inputJson,
      areaPrompts: this.buildStubGoalAreaPrompts(input),
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

  static requiresUserConsent(provider = process.env.AI_PROVIDER ?? 'stub') {
    return EXTERNAL_AI_PROVIDERS.includes(provider.toLowerCase() as AiProvider);
  }

  private resolveProvider(): AiProvider {
    const provider = (process.env.AI_PROVIDER ?? 'stub').toLowerCase();
    if (provider === 'stub' || provider === 'openai' || provider === 'gemini') {
      return provider;
    }
    throw new BadRequestException(`Unsupported AI_PROVIDER: ${provider}`);
  }

  private generateStubProposal(
    input: CycleProposalInput,
    inputJson: Record<string, unknown>,
    startedAt: number,
  ): CycleProposal {
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
      questions: Array.from({ length: QUESTIONS_PER_AREA }, (_, index) => ({
        text: `${input.area.name}: verifica ${index + 1}`,
        objectiveRef: `area:${input.area.id}`,
        orderIndex: index + 1,
        options: DEFAULT_OPTIONS,
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
        'OPENAI_API_KEY is required for AI_PROVIDER=openai',
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
            schema: this.buildProposalJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`OpenAI proposal failed: ${errorText}`);
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
      throw new BadRequestException('OpenAI proposal response is empty');
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
        'GEMINI_API_KEY is required for AI_PROVIDER=gemini',
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
            responseJsonSchema: this.buildProposalJsonSchema({
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Gemini proposal failed: ${errorText}`);
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
        'empty response';
      throw new BadRequestException(
        `Gemini proposal response is empty: ${reason}`,
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

  private async generateOpenAiGoalAreaPrompts(
    input: GoalAreaPromptInput,
    inputJson: Record<string, unknown>,
  ): Promise<GoalAreaPromptResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY is required for AI_PROVIDER=openai',
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
            content: input.basePrompt,
          },
          {
            role: 'user',
            content: JSON.stringify(this.buildGoalPromptTask(input)),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'goal_area_prompts',
            strict: true,
            schema: this.buildGoalAreaPromptJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`OpenAI goal prompts failed: ${errorText}`);
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
      throw new BadRequestException('OpenAI goal prompt response is empty');
    }

    return this.normalizeGoalAreaPrompts(
      input,
      'openai',
      model,
      this.parseGoalAreaPromptJson(outputText, 'OpenAI'),
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
        'OPENAI_API_KEY is required for AI_PROVIDER=openai',
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
            schema: this.buildGoalValidationJsonSchema(),
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`OpenAI goal validation failed: ${errorText}`);
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
      throw new BadRequestException('OpenAI goal validation response is empty');
    }
    return this.normalizeGoalValidation(
      input,
      'openai',
      model,
      this.parseGoalValidationJson(outputText, 'OpenAI'),
      inputJson,
    );
  }

  private async generateGeminiGoalAreaPrompts(
    input: GoalAreaPromptInput,
    inputJson: Record<string, unknown>,
  ): Promise<GoalAreaPromptResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'GEMINI_API_KEY is required for AI_PROVIDER=gemini',
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
              parts: [{ text: JSON.stringify(this.buildGoalPromptTask(input)) }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: this.buildGoalAreaPromptJsonSchema({
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Gemini goal prompts failed: ${errorText}`);
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
        `Gemini goal prompt response is empty: ${
          payload.promptFeedback?.blockReason ?? 'empty response'
        }`,
      );
    }

    return this.normalizeGoalAreaPrompts(
      input,
      'gemini',
      model,
      this.parseGoalAreaPromptJson(outputText, 'Gemini'),
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
        'GEMINI_API_KEY is required for AI_PROVIDER=gemini',
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
            responseJsonSchema: this.buildGoalValidationJsonSchema({
              includePropertyOrdering: true,
            }),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new BadRequestException(`Gemini goal validation failed: ${errorText}`);
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
        `Gemini goal validation response is empty: ${
          payload.promptFeedback?.blockReason ?? 'empty response'
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
      .slice(0, QUESTIONS_PER_AREA)
      .map((question, index) => ({
        text: question.text || `${input.area.name}: verifica ${index + 1}`,
        objectiveRef: question.objectiveRef || `area:${input.area.id}`,
        orderIndex: question.orderIndex || index + 1,
        options: DEFAULT_OPTIONS,
      }));

    if (planItems.length === 0 || questions.length !== QUESTIONS_PER_AREA) {
      throw new BadRequestException(`${provider} proposal failed validation`);
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
    return {
      task: 'Genera una proposta di lavoro specifica per area e tre domande di valutazione basate sul contesto atleta fornito.',
      constraints: {
        questions: QUESTIONS_PER_AREA,
        answerOptions: DEFAULT_OPTIONS,
        responseFormat:
          areaGenerationConfig?.responseFormatPrompt ??
          'Usa il formato JSON richiesto dallo schema tecnico.',
        questionnaireLayout:
          areaGenerationConfig?.questionnaireLayoutJson ?? null,
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

  private buildGoalPromptTask(input: GoalAreaPromptInput) {
    return {
      task: 'Genera un prompt operativo personalizzato per ogni area di performance dell atleta.',
      language: 'Italiano',
      athleteGoal: input.goalText,
      onboardingProfile: input.onboardingProfile,
      onboardingAnswers: input.onboardingAnswers,
      areas: input.areas,
      constraints: {
        onePromptPerArea: true,
        promptUse:
          'Ogni prompt verra usato come istruzione stabile nei cicli AI futuri per quella specifica coppia atleta-area.',
        eachPromptMustInclude: [
          'interpretazione dell obiettivo atleta per l area',
          'priorita di lavoro',
          'vincoli di sicurezza e revisione professionale',
          'criteri per rendere esercizi e questionari coerenti con l obiettivo',
        ],
        avoid: [
          'diagnosi mediche',
          'promesse di risultato',
          'dati non presenti nel contesto',
        ],
      },
    };
  }

  private buildGoalValidationTask(input: GoalValidationInput) {
    return {
      task: 'Valida l obiettivo iniziale Performance Factory e, solo se status=OK, genera prompt specialistici per le aree ufficiali.',
      platformPrinciple:
        'Performance Factory promuove il miglioramento personale rispetto al punto di partenza, non il confronto tossico con gli altri.',
      officialAreas: [
        'Preparazione atletica',
        'Equipaggiamento',
        'Mental training',
        'Nutrizione',
        'Fisioterapia',
        'Tecnico-tattica',
      ],
      athleteGoal: input.goalText,
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
        OK: 'Obiettivo sportivo/performance, chiaro, sicuro, personale, misurabile e dati sufficienti per generare prompt area.',
        NEEDS_ANAMNESIS:
          'Obiettivo valido ma mancano dati personali indispensabili.',
        GOAL_NEEDS_REFORMULATION:
          'Obiettivo potenzialmente coerente ma troppo vago, generico, non misurabile o troppo orientato a battere altri.',
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
        'Se status diverso da OK, area_prompts deve avere tutti i valori null.',
        'Se status OK, compila tutti i sei prompt area.',
        'Ogni prompt area deve essere utilizzabile da un modulo AI specialistico e contenere role, objective, required_inputs, initial_questionnaire, exercise_generation_rules, feedback_questions, progression_rules, measurement_indicators, safety_limits, output_format.',
      ],
    };
  }

  private buildGoalValidationJsonSchema(options?: {
    includePropertyOrdering?: boolean;
  }) {
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
          required: [
            'preparazione_atletica',
            'equipaggiamento',
            'mental_training',
            'nutrizione',
            'fisioterapia',
            'tecnico_tattica',
          ],
          properties: {
            preparazione_atletica: nullableAreaPromptSchema,
            equipaggiamento: nullableAreaPromptSchema,
            mental_training: nullableAreaPromptSchema,
            nutrizione: nullableAreaPromptSchema,
            fisioterapia: nullableAreaPromptSchema,
            tecnico_tattica: nullableAreaPromptSchema,
          },
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

  private buildGoalAreaPromptJsonSchema(options?: {
    includePropertyOrdering?: boolean;
  }) {
    const itemSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['areaId', 'promptText'],
      properties: {
        areaId: { type: 'string' },
        promptText: { type: 'string' },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['areaId', 'promptText'] }
        : {}),
    };
    return {
      type: 'object',
      additionalProperties: false,
      required: ['areaPrompts'],
      properties: {
        areaPrompts: {
          type: 'array',
          minItems: 1,
          items: itemSchema,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['areaPrompts'] }
        : {}),
    };
  }

  private buildModelContext(context: AiCycleContext) {
    const { guidance: _guidance, ...modelContext } = context;
    void _guidance;
    return modelContext;
  }

  private buildProposalJsonSchema(options?: {
    includePropertyOrdering?: boolean;
  }) {
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
        orderIndex: { type: 'integer', minimum: 1, maximum: 3 },
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
          minItems: QUESTIONS_PER_AREA,
          maxItems: QUESTIONS_PER_AREA,
          items: questionSchema,
        },
      },
      ...(options?.includePropertyOrdering
        ? { propertyOrdering: ['summaryText', 'planItems', 'questions'] }
        : {}),
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
        `${providerName} proposal response is not valid JSON`,
      );
    }
  }

  private parseGoalAreaPromptJson(outputText: string, providerName: string) {
    try {
      return JSON.parse(outputText) as {
        areaPrompts?: Array<{ areaId?: string; promptText?: string }>;
      };
    } catch {
      throw new BadRequestException(
        `${providerName} goal prompt response is not valid JSON`,
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
        `${providerName} goal validation response is not valid JSON`,
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
      questionsToUser: Array.isArray(parsed.questions_to_user)
        ? parsed.questions_to_user.filter((item): item is string => typeof item === 'string')
        : [],
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
          sport_or_activity: null,
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
        sport_or_activity: null,
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
                objective: `Personalizzare il lavoro ${area.name} rispetto all obiettivo: ${input.goalText.trim()}`,
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
              },
            ]),
          )
        : {},
      next_step: hasOnboarding
        ? 'Congelare obiettivo e generare prompt area.'
        : 'Avviare anamnesi.',
    };
  }

  private normalizeGoalAreaPrompts(
    input: GoalAreaPromptInput,
    provider: AiProvider,
    model: string,
    parsed: { areaPrompts?: Array<{ areaId?: string; promptText?: string }> },
    inputJson: Record<string, unknown>,
  ): GoalAreaPromptResult {
    const promptsByArea = new Map(
      (parsed.areaPrompts ?? [])
        .filter((item) => item.areaId && item.promptText)
        .map((item) => [item.areaId as string, item.promptText as string]),
    );
    const areaPrompts = input.areas.map((area) => ({
      areaId: area.id,
      areaName: area.name,
      promptText:
        promptsByArea.get(area.id) ??
        this.buildFallbackGoalAreaPrompt(input.goalText, area.name),
    }));

    if (areaPrompts.some((item) => !item.promptText.trim())) {
      throw new BadRequestException(`${provider} goal prompts failed validation`);
    }

    return {
      provider,
      model,
      promptVersion: GOAL_PROMPT_VERSION,
      promptHash: this.hashJson(inputJson),
      inputJson,
      areaPrompts,
    };
  }

  private buildStubGoalAreaPrompts(input: GoalAreaPromptInput) {
    return input.areas.map((area) => ({
      areaId: area.id,
      areaName: area.name,
      promptText: this.buildFallbackGoalAreaPrompt(input.goalText, area.name),
    }));
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
        responseJsonSchema: this.buildProposalJsonSchema(),
      },
    };
  }

  private buildGoalPromptAuditInput(input: GoalAreaPromptInput) {
    return {
      prompt: {
        system: input.basePrompt,
        user: this.buildGoalPromptTask(input),
        responseJsonSchema: this.buildGoalAreaPromptJsonSchema(),
      },
    };
  }

  private buildGoalValidationAuditInput(input: GoalValidationInput) {
    return {
      prompt: {
        system: input.basePrompt,
        user: this.buildGoalValidationTask(input),
        responseJsonSchema: this.buildGoalValidationJsonSchema(),
      },
    };
  }

  private buildSystemPrompt(input: CycleProposalInput) {
    const basePrompt =
      input.context.guidance.areaGenerationConfig?.initialContext ??
      SYSTEM_PROMPT;
    const responseFormatPrompt =
      input.context.guidance.areaGenerationConfig?.responseFormatPrompt;
    const instructions = input.context.guidance.adminPromptInstructions;
    const sections = [basePrompt];
    if (responseFormatPrompt) {
      sections.push(`Forma della risposta configurata:\n${responseFormatPrompt}`);
    }
    if (!instructions.length) {
      return sections.join('\n\n');
    }
    const adminInstructions = instructions
      .map(
        (instruction) =>
          `[${instruction.scope} ${instruction.athleteLevel} v${instruction.version} - ${instruction.name}]\n${instruction.basePrompt}`,
      )
      .join('\n\n');

    sections.push(`Istruzioni configurate dall amministratore:\n${adminInstructions}`);
    return sections.join('\n\n');
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

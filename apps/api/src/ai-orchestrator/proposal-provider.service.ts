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

const PROMPT_VERSION = 'cycle-proposal-v2';
const GOAL_PROMPT_VERSION = 'goal-area-prompts-v1';
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

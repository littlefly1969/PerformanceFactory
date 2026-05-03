import { BadRequestException } from '@nestjs/common';
import {
  AiProposalProviderService,
  CycleProposalInput,
} from './proposal-provider.service';

const input: CycleProposalInput = {
  userId: 'user-1',
  area: { id: 'area-1', name: 'Footwork' },
  nextVersion: 1,
  reason: 'Cycle test',
  scale: {
    minScore: 0,
    maxScore: 100,
    potentialStep: 5,
    thresholdRatio: 0.85,
  },
  previousSnapshot: null,
  context: {
    athlete: {
      performanceGoal: 'Improve match readiness',
      generalAnamnesis: null,
      targetAreaAnamnesis: null,
      areaLevel: 'BASELINE',
    },
    targetArea: { name: 'Footwork' },
    cycle: { nextVersion: 1 },
    performance: {
      latestSnapshot: null,
    },
    history: { previousAreaCycles: [] },
    guidance: {
      areaGenerationConfig: null,
      adminPromptInstructions: [],
      userAreaPromptInstruction: null,
      planItemRequirements: [
        'Make the work practical, measurable, and reviewable.',
      ],
      questionnaireRequirements: ['Create exactly three monitoring questions.'],
      safetyRules: ['Avoid medical claims.'],
    },
  },
};

describe('AiProposalProviderService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('generates proposals through Gemini using structured JSON output', async () => {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL_PROPOSAL = 'gemini-2.5-flash';

    const responseText = JSON.stringify({
      summaryText: 'Footwork richiede progressioni mirate.',
      planItems: [
        {
          type: 'FOCUS',
          title: 'Ritmo footwork',
          body: 'Esegui due drill misurabili di ritmo footwork per sessione.',
        },
      ],
      questions: [
        {
          text: 'Mantieni equilibrio nei cambi di direzione?',
          objectiveRef: 'area:area-1',
          orderIndex: 1,
        },
        {
          text: 'Recuperi rapidamente dopo un accelerazione?',
          objectiveRef: 'area:area-1',
          orderIndex: 2,
        },
        {
          text: 'Il timing dello split step e costante?',
          objectiveRef: 'area:area-1',
          orderIndex: 3,
        },
      ],
    });

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: responseText }],
            },
          },
        ],
      }),
    } as unknown as Response);

    const proposal =
      await new AiProposalProviderService().generateCycleProposal(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    );
    expect(request.headers).toMatchObject({
      'x-goog-api-key': 'test-gemini-key',
      'Content-Type': 'application/json',
    });

    const body = JSON.parse(request.body as string) as {
      generationConfig: {
        responseMimeType: string;
        responseJsonSchema: { propertyOrdering?: string[] };
      };
    };
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseJsonSchema.propertyOrdering).toEqual([
      'summaryText',
      'planItems',
      'questions',
    ]);

    expect(proposal.provider).toBe('gemini');
    expect(proposal.model).toBe('gemini-2.5-flash');
    expect(proposal.planItems[0].metadata).toMatchObject({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(proposal.questions).toHaveLength(3);
    expect(proposal.audit.outputJson.provider).toBe('gemini');
    expect(proposal.audit.inputJson.prompt).toMatchObject({
      system: expect.stringContaining('assistente senior di sport performance'),
      responseJsonSchema: {
        required: ['summaryText', 'planItems', 'questions'],
      },
    });
  });

  it('requires a Gemini API key when Gemini is selected', async () => {
    process.env.AI_PROVIDER = 'gemini';
    delete process.env.GEMINI_API_KEY;

    await expect(
      new AiProposalProviderService().generateCycleProposal(input),
    ).rejects.toThrow(BadRequestException);
  });

  it('marks Gemini as an external provider that requires user consent', () => {
    expect(AiProposalProviderService.requiresUserConsent('gemini')).toBe(true);
    expect(AiProposalProviderService.requiresUserConsent('stub')).toBe(false);
  });
});

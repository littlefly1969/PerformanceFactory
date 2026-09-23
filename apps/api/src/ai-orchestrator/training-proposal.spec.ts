import { Logger } from '@nestjs/common';
import {
  prescriptionRange,
  trainingAvailability,
  trainingFrequency,
} from './training-constraints';
import { trainingWindow, validateTrainingSchedule } from './training-schedule';
import { TrainingProposalInput } from './proposal-provider-model';
import {
  buildTrainingProposalPreview,
  generateTrainingProposal,
  normalizeTrainingProposal,
} from './training-proposal';
import {
  buildProposalJsonSchema,
  buildTrainingProposalJsonSchema,
} from './proposal-schemas';
import { normalizeProposal } from './proposal-cycle';

const input: TrainingProposalInput = {
  userId: 'athlete',
  area: { id: 'training', name: 'Training' },
  nextVersion: 1,
  reason: 'Training',
  scale: { minScore: 0, maxScore: 100, potentialStep: 5, thresholdRatio: 0.85 },
  previousSnapshot: null,
  context: {
    athlete: {
      generalAnamnesis: { general_training_frequency: '2_3' },
      targetAreaAnamnesis: null,
      areaLevel: 'TRAINING',
    },
    targetArea: { name: 'Training' },
    cycle: { nextVersion: 1 },
    performance: { latestSnapshot: null },
    history: { olderCyclesSummary: null, previousAreaCycles: [] },
    guidance: {
      areaGenerationConfig: null,
      userAreaPromptInstruction: null,
      sportSpecializationPromptInstruction: null,
      trainingPromptInstruction: null,
      planItemRequirements: [],
      questionnaireRequirements: [],
      safetyRules: [],
    },
  },
  trainingConstraints: {
    programDurationWeeks: 12,
    operationalWindowDays: 14,
    currentFrequency: { min: 2, max: 3 },
    availability: { daysPerWeek: 4, sessionDurationMinutes: 60 },
    prescription: { minSessionsPerWeek: 2, maxSessionsPerWeek: 4 },
  },
  trainingWindow: {
    startsOn: '2026-10-01',
    endsOn: '2026-10-14',
    windowDays: 14,
    macroBlock: 1,
    windowInProgram: 1,
    windowsPerProgram: 6,
  },
};
const planItems = [0, 2, 4, 7, 9, 11, 13].map((dayOffset) => ({
  type: 'TECHNIQUE',
  title: `Sessione ${dayOffset}`,
  body: 'Esercizio concreto',
  dayOffset,
  durationMinutes: 50,
  equipment: 'Racchetta',
  sets: 3,
  reps: '8',
  restSeconds: 60,
}));
const raw = {
  summaryText: 'Progressione reale',
  sessionsPerWeek: 4,
  planItems,
  questions: [1, 2, 3].map((orderIndex) => ({
    text: `Domanda ${orderIndex}`,
    orderIndex,
  })),
};

describe('Rolling training constraints and contract', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });
  it.each([
    ['0_1', 0, 1],
    ['2_3', 2, 3],
    ['4_5', 4, 5],
    ['6_PLUS', 6, 7],
    ['1-2 volte', 1, 2],
    ['5 o più volte', 5, 7],
  ])('reads actual frequency %s', (value, min, max) => {
    expect(trainingFrequency(value)).toEqual({ min, max });
  });
  it('derives availability separately from habitual frequency and never invents missing data', () => {
    const profile = {
      general_training_frequency: { value: '2_3' },
      training_days_available: { value: 5 },
      training_session_duration: { value: 60 },
    };
    expect(trainingAvailability(profile).availability.daysPerWeek).toBe(5);
    expect(prescriptionRange(trainingFrequency('2_3'), 5)).toEqual({
      minSessionsPerWeek: 2,
      maxSessionsPerWeek: 4,
    });
    expect(prescriptionRange(trainingFrequency('2_3'), 1)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 1,
    });
    expect(() =>
      trainingAvailability({ general_training_frequency: { value: '2_3' } }),
    ).toThrow('TRAINING_AVAILABILITY_REQUIRED');
  });
  it('recalculates load from adherence, ratings and check-in without exceeding availability', () => {
    expect(
      prescriptionRange({ min: 2, max: 3 }, 5, {
        planned: 8,
        completed: 8,
        ratings: [4],
        checkInScores: [75],
      }).maxSessionsPerWeek,
    ).toBe(5);
    expect(
      prescriptionRange({ min: 2, max: 3 }, 5, {
        planned: 8,
        completed: 3,
        ratings: [4],
        checkInScores: [75],
      }).maxSessionsPerWeek,
    ).toBe(2);
    expect(
      prescriptionRange({ min: 2, max: 3 }, 5, {
        planned: 8,
        completed: 8,
        ratings: [2],
        checkInScores: [75],
      }).maxSessionsPerWeek,
    ).toBe(3);
    expect(
      prescriptionRange({ min: 2, max: 3 }, 5, {
        planned: 8,
        completed: 8,
        ratings: [4],
        checkInScores: [25],
      }).maxSessionsPerWeek,
    ).toBe(3);
  });
  it.each([4, 12, 52])(
    'keeps %s weeks as strategic horizon and rolls into the next macroblock',
    (weeks) => {
      const first = trainingWindow(
        null,
        1,
        weeks,
        new Date('2026-10-01T08:00:00Z'),
      );
      expect(first).toMatchObject({
        startsOn: '2026-10-01',
        endsOn: '2026-10-14',
        windowDays: 14,
        windowsPerProgram: weeks / 2,
      });
      const next = trainingWindow(
        new Date('2026-10-14'),
        weeks / 2 + 1,
        weeks,
        new Date('2026-10-14T08:00:00Z'),
      );
      expect(next).toMatchObject({
        startsOn: '2026-10-15',
        endsOn: '2026-10-28',
        macroBlock: 2,
        windowInProgram: 1,
      });
    },
  );
  it('uses Rome date across DST and advances delayed windows to today', () => {
    expect(
      trainingWindow(null, 1, 12, new Date('2026-10-24T22:30:00Z')).startsOn,
    ).toBe('2026-10-25');
    expect(
      trainingWindow(
        new Date('2026-10-14'),
        2,
        12,
        new Date('2026-10-18T09:00:00Z'),
      ).startsOn,
    ).toBe('2026-10-18');
  });
  it('preserves seven scheduled sessions and optional execution details without changing AREA', () => {
    const normalized = normalizeTrainingProposal(
      input,
      raw,
      'stub',
      'test',
      {},
      Date.now(),
    );
    expect(normalized.planItems).toEqual(planItems);
    expect(normalized.audit.outputJson.trainingWindow).toEqual(
      input.trainingWindow,
    );
    expect(
      buildTrainingProposalJsonSchema(input).properties.planItems.maxItems,
    ).toBe(8);
    expect(buildProposalJsonSchema(input).properties.planItems.maxItems).toBe(
      3,
    );
    expect(
      normalizeProposal(input, 'stub', 'test', raw, {}, Date.now()).planItems,
    ).toHaveLength(3);
  });
  it.each([
    [
      'out of range',
      () => ({
        ...raw,
        planItems: raw.planItems.map((s, i) =>
          i === 0 ? { ...s, dayOffset: 14 } : s,
        ),
      }),
    ],
    [
      'negative day',
      () => ({
        ...raw,
        planItems: raw.planItems.map((s, i) =>
          i === 0 ? { ...s, dayOffset: -1 } : s,
        ),
      }),
    ],
    [
      'duration',
      () => ({
        ...raw,
        planItems: raw.planItems.map((s, i) =>
          i === 0 ? { ...s, durationMinutes: 61 } : s,
        ),
      }),
    ],
    [
      'duplicate',
      () => ({
        ...raw,
        planItems: raw.planItems.map((s, i) =>
          i === 0 ? { ...s, dayOffset: 2 } : s,
        ),
      }),
    ],
    [
      'too few sessions',
      () => ({ ...raw, planItems: raw.planItems.slice(0, 1) }),
    ],
    ['weekly summary', () => ({ ...raw, sessionsPerWeek: 3 })],
  ])('rejects %s before persistence', (_name, make) => {
    expect(() =>
      validateTrainingSchedule(
        make(),
        input.trainingConstraints,
        input.trainingWindow.startsOn,
      ),
    ).toThrow();
  });
  it('rejects excess sessions in either week and respects preferred ISO weekdays', () => {
    expect(() =>
      validateTrainingSchedule(
        {
          ...raw,
          planItems: [0, 1, 2, 3, 4, 7, 9].map((dayOffset) => ({
            ...planItems[0],
            dayOffset,
          })),
        },
        input.trainingConstraints,
        input.trainingWindow.startsOn,
      ),
    ).toThrow();
    expect(() =>
      validateTrainingSchedule(
        raw,
        {
          ...input.trainingConstraints,
          availability: {
            ...input.trainingConstraints.availability,
            preferredDays: [1, 3, 5],
          },
        },
        input.trainingWindow.startsOn,
      ),
    ).toThrow();
  });
  it.each(['openai', 'gemini'])(
    'uses the dedicated structured schedule with %s',
    async (provider) => {
      process.env.AI_PROVIDER = provider;
      process.env.OPENAI_API_KEY = 'unit-test-key';
      process.env.GEMINI_API_KEY = 'unit-test-key';
      const response = new Response(
        JSON.stringify(
          provider === 'openai'
            ? { output_text: JSON.stringify(raw) }
            : {
                candidates: [
                  { content: { parts: [{ text: JSON.stringify(raw) }] } },
                ],
              },
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
      const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(response);
      const proposal = await generateTrainingProposal(
        new Logger('test'),
        input,
      );
      expect(proposal.planItems).toHaveLength(7);
      const body = fetch.mock.calls[0][1]?.body;
      expect(body).toEqual(expect.stringContaining('dayOffset'));
      expect(body).toEqual(expect.stringContaining('operationalWindowDays'));
      expect(
        buildTrainingProposalPreview(input).inputJson.prompt.user.constraints
          .programDurationWeeks,
      ).toBe(12);
    },
  );
});

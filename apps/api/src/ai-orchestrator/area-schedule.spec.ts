import { Logger } from '@nestjs/common';
import {
  areaPrescription,
  freeDayOffsets,
  generateAreaScheduleProposal,
  validateAreaSchedule,
} from './area-schedule';
import {
  AreaScheduleInput,
  ScheduleConstraints,
} from './proposal-provider-model';

const window = { startsOn: '2026-10-05', endsOn: '2026-10-18', windowDays: 14 };
const now = new Date('2026-10-05T08:00:00Z');
const availability = { daysPerWeek: 5, sessionDurationMinutes: 60 };
const day = (offset: number) =>
  new Date(Date.UTC(2026, 9, 5 + offset, 0, 0, 0));

function constraints(
  min: number,
  max: number,
  extra: Partial<ScheduleConstraints['availability']> = {},
): ScheduleConstraints {
  return {
    operationalWindowDays: 14,
    currentFrequency: { min: 1, max: 2 },
    availability: { ...availability, ...extra },
    prescription: { minSessionsPerWeek: min, maxSessionsPerWeek: max },
  };
}

describe('freeDayOffsets', () => {
  it('esclude i giorni occupati dal programma sportivo', () => {
    const offsets = freeDayOffsets(
      window,
      [day(0), day(2), day(7)],
      availability,
      now,
    );
    expect(offsets).not.toContain(0);
    expect(offsets).not.toContain(2);
    expect(offsets).not.toContain(7);
    expect(offsets).toContain(1);
    expect(offsets).toHaveLength(11);
  });

  it('esclude i giorni gia passati e quelli non preferiti', () => {
    const offsets = freeDayOffsets(
      window,
      [],
      { ...availability, preferredDays: [1, 3] },
      new Date('2026-10-08T08:00:00Z'),
    );
    // 2026-10-05 e un lunedi: restano solo lunedi e mercoledi da oggi in poi.
    expect(offsets).toEqual([7, 9]);
  });
});

describe('areaPrescription', () => {
  it('limita la frequenza ai giorni disponibili residui', () => {
    // Cinque giorni disponibili a settimana, quattro gia usati dallo sport.
    expect(areaPrescription([1, 3, 5, 8, 10, 12], 14, [4, 4], 5)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 1,
    });
  });

  it('applica il tetto di area quando la capienza e ampia', () => {
    expect(areaPrescription([0, 1, 2, 3, 7, 8, 9, 10], 14, [0, 0], 7)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 3,
    });
  });

  it('rifiuta la finestra quando una settimana non ha capienza', () => {
    expect(() => areaPrescription([0, 1, 2], 14, [0, 0], 5)).toThrow(
      /Nessun giorno disponibile/,
    );
    expect(() => areaPrescription([0, 1, 8], 14, [5, 0], 5)).toThrow(
      /Nessun giorno disponibile/,
    );
  });

  it('riduce il massimo quando l aderenza precedente e bassa', () => {
    const previous = {
      planned: 6,
      completed: 2,
      ratings: [],
      checkInScores: [],
    };
    expect(
      areaPrescription([0, 1, 2, 3, 7, 8, 9, 10], 14, [0, 0], 7, previous),
    ).toEqual({ minSessionsPerWeek: 1, maxSessionsPerWeek: 1 });
  });
});

describe('validateAreaSchedule', () => {
  const planItems = [
    {
      type: 'AREA_SESSION',
      title: 'a',
      body: 'b',
      dayOffset: 1,
      durationMinutes: 45,
    },
    {
      type: 'AREA_SESSION',
      title: 'c',
      body: 'd',
      dayOffset: 8,
      durationMinutes: 45,
    },
  ];

  it('accetta sedute nei soli giorni liberi', () => {
    expect(() =>
      validateAreaSchedule(
        { sessionsPerWeek: 1, planItems },
        constraints(1, 2),
        window.startsOn,
        [1, 3, 8, 10],
      ),
    ).not.toThrow();
  });

  it('rifiuta una seduta in un giorno occupato dallo sport', () => {
    expect(() =>
      validateAreaSchedule(
        { sessionsPerWeek: 1, planItems },
        constraints(1, 2),
        window.startsOn,
        [3, 8, 10],
      ),
    ).toThrow(/giorno gia occupato dallo sport/);
  });

  it('rifiuta una durata oltre la disponibilita', () => {
    expect(() =>
      validateAreaSchedule(
        {
          sessionsPerWeek: 1,
          planItems: [{ ...planItems[0], durationMinutes: 90 }, planItems[1]],
        },
        constraints(1, 2),
        window.startsOn,
        [1, 8],
      ),
    ).toThrow(/durata oltre la disponibilit/);
  });
});

describe('generateAreaScheduleProposal', () => {
  const input: AreaScheduleInput = {
    userId: 'athlete',
    area: { id: 'area-1', name: 'Preparazione atletica' },
    nextVersion: 1,
    reason: 'Sedute di area',
    scale: {
      minScore: 0,
      maxScore: 100,
      potentialStep: 5,
      thresholdRatio: 0.85,
    },
    previousSnapshot: null,
    context: {
      athlete: {
        generalAnamnesis: { general_training_frequency: '2_3' },
        targetAreaAnamnesis: null,
        areaLevel: 'BASE',
      },
      targetArea: { name: 'Preparazione atletica' },
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
    areaWindow: window,
    freeDayOffsets: [1, 3, 8, 10],
    scheduleConstraints: constraints(1, 2),
  } as unknown as AreaScheduleInput;

  it('produce attivita datate nei giorni liberi con la schedulazione nei metadata', async () => {
    const proposal = await generateAreaScheduleProposal(
      new Logger('test'),
      input,
    );
    expect(proposal.promptVersion).toBe('area-schedule-v1');
    expect(proposal.planItems.length).toBeGreaterThan(0);
    const offsets = proposal.planItems.map(
      (item) =>
        (item.metadata as { schedule: { dayOffset: number } }).schedule
          .dayOffset,
    );
    expect(
      offsets.every((offset) => input.freeDayOffsets.includes(offset)),
    ).toBe(true);
    expect(new Set(offsets).size).toBe(offsets.length);
    expect(proposal.questions.length).toBeGreaterThan(0);
  });
});

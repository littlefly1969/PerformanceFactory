import { Logger } from '@nestjs/common';
import {
  areaPrescription,
  areaScheduleDays,
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

describe('areaScheduleDays', () => {
  it('usa i giorni liberi entro i giorni disponibili residui', () => {
    // Cinque giorni disponibili a settimana, quattro gia usati dallo sport.
    const days = areaScheduleDays(
      window,
      [0, 2, 4, 6, 7, 9, 11, 13].map(day),
      availability,
      now,
    );
    expect(days).toEqual({
      freeDayOffsets: [1, 3, 5, 8, 10, 12],
      sharedDayOffsets: [],
      capacity: [1, 1],
    });
    expect(areaPrescription(days.capacity)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 1,
    });
  });

  it('affianca le sessioni sportive quando i giorni dichiarati sono gia allenati', () => {
    // Due giorni disponibili, entrambi occupati dallo sport in ogni settimana.
    const days = areaScheduleDays(
      window,
      [1, 4, 8, 11].map(day),
      { daysPerWeek: 2, sessionDurationMinutes: 45 },
      now,
    );
    expect(days).toEqual({
      freeDayOffsets: [],
      sharedDayOffsets: [1, 4, 8, 11],
      capacity: [2, 2],
    });
    expect(areaPrescription(days.capacity)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 2,
    });
  });

  it('sceglie giorni liberi o condivisi settimana per settimana', () => {
    const days = areaScheduleDays(
      window,
      [0, 2, 4, 7, 9].map(day),
      { daysPerWeek: 3, sessionDurationMinutes: 45 },
      now,
    );
    expect(days).toEqual({
      freeDayOffsets: [8, 10, 11, 12, 13],
      sharedDayOffsets: [0, 2, 4],
      capacity: [3, 1],
    });
  });

  it('non condivide giorni sportivi gia passati', () => {
    const days = areaScheduleDays(
      window,
      [1, 4, 8, 11].map(day),
      { daysPerWeek: 2, sessionDurationMinutes: 45 },
      new Date('2026-10-08T08:00:00Z'),
    );
    expect(days.sharedDayOffsets).toEqual([4, 8, 11]);
    expect(days.capacity).toEqual([1, 2]);
  });
});

describe('areaPrescription', () => {
  it('applica il tetto di area quando la capienza e ampia', () => {
    expect(areaPrescription([4, 4])).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 3,
    });
  });

  it('rifiuta la finestra quando una settimana non ha capienza', () => {
    expect(() => areaPrescription([3, 0])).toThrow(/Nessun giorno disponibile/);
    // Settimana gia trascorsa, senza giorni liberi ne sessioni sportive future.
    const days = areaScheduleDays(
      window,
      [1, 4, 8, 11].map(day),
      { daysPerWeek: 2, sessionDurationMinutes: 45 },
      new Date('2026-10-12T08:00:00Z'),
    );
    expect(() => areaPrescription(days.capacity)).toThrow(
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
    expect(areaPrescription([4, 4], previous)).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 1,
    });
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

  it('accetta una seduta breve nel giorno sportivo condiviso', () => {
    expect(() =>
      validateAreaSchedule(
        {
          sessionsPerWeek: 1,
          planItems: planItems.map((item) => ({
            ...item,
            durationMinutes: 20,
          })),
        },
        constraints(1, 2),
        window.startsOn,
        [],
        [1, 8],
      ),
    ).not.toThrow();
  });

  it('rifiuta una seduta lunga nel giorno sportivo condiviso', () => {
    expect(() =>
      validateAreaSchedule(
        { sessionsPerWeek: 1, planItems },
        constraints(1, 2),
        window.startsOn,
        [],
        [1, 8],
      ),
    ).toThrow(/seduta troppo lunga nel giorno sportivo/);
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
    sharedDayOffsets: [],
    scheduleConstraints: constraints(1, 2),
  } as unknown as AreaScheduleInput;

  it('produce attivita datate nei giorni liberi con la schedulazione nei metadata', async () => {
    const proposal = await generateAreaScheduleProposal(
      new Logger('test'),
      input,
    );
    expect(proposal.promptVersion).toBe('area-schedule-v2');
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

  it('abbina sedute brevi ai giorni sportivi quando non ci sono giorni liberi', async () => {
    const proposal = await generateAreaScheduleProposal(new Logger('test'), {
      ...input,
      freeDayOffsets: [],
      sharedDayOffsets: [1, 4, 8, 11],
      scheduleConstraints: constraints(1, 2, { daysPerWeek: 2 }),
    });
    const schedules = proposal.planItems.map(
      (item) =>
        (
          item.metadata as {
            schedule: { dayOffset: number; durationMinutes: number };
          }
        ).schedule,
    );
    expect(schedules.length).toBeGreaterThan(0);
    for (const schedule of schedules) {
      expect([1, 4, 8, 11]).toContain(schedule.dayOffset);
      expect(schedule.durationMinutes).toBeLessThanOrEqual(20);
    }
  });
});

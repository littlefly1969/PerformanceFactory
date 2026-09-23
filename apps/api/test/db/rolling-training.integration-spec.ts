import * as dates from '../../src/athlete/training-sessions';
import { AnswersService } from '../../src/answers/answers.service';
import { lifecycleFixture } from './lifecycle-test-helper';
import { TrainingLifecycleOrchestrator } from '../../src/training-lifecycle/training-lifecycle.orchestrator';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { TrainingConstraintsService } from '../../src/ai-orchestrator/training-constraints';
import { AthleteService } from '../../src/athlete/athlete.service';
import { createTrainingSessions } from '../../src/athlete/training-sessions';
import { normalizeTrainingProposal } from '../../src/ai-orchestrator/training-proposal';

describe('Rolling calendar and athlete availability with PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof lifecycleFixture>>;
  let lifecycle: TrainingLifecycleOrchestrator;
  const env = { ...process.env };
  beforeAll(async () => {
    f = await lifecycleFixture();
    lifecycle = f.app.get(TrainingLifecycleOrchestrator);
    await f.coach();
  }, 60000);
  afterAll(async () => {
    await f?.cleanup();
    process.env = env;
  });
  afterEach(() => jest.restoreAllMocks());
  async function request(userId: string) {
    await lifecycle.requestPlan(userId);
    return f.prisma.trainingLifecycleOperation.findFirstOrThrow({
      where: { userId },
    });
  }
  it('collects missing availability without fabricating time, then resumes the saved request', async () => {
    const athlete = await f.user();
    await f.prisma.userOnboardingAssessment.update({
      where: { userId: athlete.id },
      data: {
        profileJson: {
          program_duration_weeks: { value: 12 },
          general_training_frequency: { value: '2_3' },
        },
      },
    });
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateTrainingProposal',
    );
    const operation = await request(athlete.id);
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'ERROR',
      errorCode: 'TRAINING_AVAILABILITY_REQUIRED',
    });
    expect(generate).not.toHaveBeenCalled();
    const url = '/api/athlete/training/availability';
    const payload = {
      currentFrequency: '2_3',
      daysPerWeek: 1,
      sessionDurationMinutes: 30,
      programDurationWeeks: 12,
    };
    for (const bad of [
      { ...payload, daysPerWeek: 8 },
      { ...payload, sessionDurationMinutes: 180 },
      { ...payload, programDurationWeeks: 28 },
      { ...payload, userId: 'other' },
    ])
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url,
            headers: athlete.headers,
            payload: bad,
          })
        ).statusCode,
      ).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url,
          headers: athlete.headers,
          payload,
        })
      ).statusCode,
    ).toBe(201);
    await lifecycle.drain();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
    });
    const input = generate.mock.calls[0][0];
    expect(input.trainingConstraints.prescription).toEqual({
      minSessionsPerWeek: 1,
      maxSessionsPerWeek: 1,
    });
    const sessions = await f.prisma.trainingSession.findMany({
      where: { userId: athlete.id },
      include: { trainingPlanItem: true },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].trainingPlanItem.metadata).toMatchObject({
      durationMinutes: 30,
    });
    const other = await f.user();
    const response = await f.app.inject({
      method: 'GET',
      url,
      headers: other.headers,
    });
    expect(response.json<{ daysPerWeek: number }>().daysPerWeek).toBe(4);
  });
  it.each([4, 12, 52])(
    'preserves the selected %s-week program in discovery, context and home',
    async (weeks) => {
      const athlete = await f.user();
      await f.prisma.athleteDiscovery.create({
        data: {
          userId: athlete.id,
          version: 1,
          configuration: { questions: [] },
          draft: { answers: {} },
          phase: 'COMPLETE',
          programDurationWeeks: weeks,
        },
      });
      expect(
        (await f.app.get(TrainingConstraintsService).build(athlete.id))
          .programDurationWeeks,
      ).toBe(weeks);
      const operation = await request(athlete.id);
      await lifecycle.resumeLifecycle(operation.id);
      const home = await f.app.get(AthleteService).home(athlete.id);
      expect(home.program.durationWeeks).toBe(weeks);
      expect(home.program.cycle).toMatchObject({
        windowDays: 14,
        windowsPerProgram: weeks / 2,
        windowInProgram: 1,
      });
      expect(
        (
          await f.prisma.athleteDiscovery.findUniqueOrThrow({
            where: { userId: athlete.id },
          })
        ).programDurationWeeks,
      ).toBe(weeks);
    },
  );
  it('materializes all seven AI dates including day 13 and returns the same persisted sessions to PF4', async () => {
    const athlete = await f.user();
    jest
      .spyOn(f.app.get(AiProposalProviderService), 'generateTrainingProposal')
      .mockImplementation((input) =>
        Promise.resolve(
          normalizeTrainingProposal(
            input,
            {
              summaryText: 'Due settimane operative',
              sessionsPerWeek: 4,
              planItems: [0, 2, 4, 7, 9, 11, 13].map((dayOffset) => ({
                type: 'TECHNIQUE',
                title: `Giorno ${dayOffset}`,
                body: 'Allenamento pratico',
                dayOffset,
                durationMinutes: 50,
                equipment: 'Racchetta',
                sets: 3,
                reps: '8',
                restSeconds: 60,
              })),
              questions: [1, 2, 3].map((n) => ({ text: `Verifica ${n}` })),
            },
            'stub',
            'test',
            {},
            Date.now(),
          ),
        ),
      );
    const operation = await request(athlete.id);
    await lifecycle.resumeLifecycle(operation.id);
    const plan = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
      include: { sessions: { orderBy: { sequence: 'asc' } } },
    });
    expect(plan.sessions).toHaveLength(7);
    expect(
      plan.sessions.map(
        (s) =>
          (s.scheduledDate.getTime() - plan.startsOn!.getTime()) / 86400000,
      ),
    ).toEqual([0, 2, 4, 7, 9, 11, 13]);
    expect(plan.endsOn).toEqual(plan.sessions[6].scheduledDate);
    const calendar = await f.app
      .get(AthleteService)
      .calendar(
        athlete.id,
        plan.startsOn!.toISOString().slice(0, 10),
        plan.endsOn!.toISOString().slice(0, 10),
      );
    expect(calendar.sessions.map((s) => s.id)).toEqual(
      plan.sessions.map((s) => s.id),
    );
    expect(calendar.sessions[0].details.map((d) => d.value)).toEqual(
      expect.arrayContaining(['50', 'Racchetta', '3', '8', '60']),
    );
    await f.prisma.$transaction((tx) =>
      createTrainingSessions(tx, plan.id, new Date()),
    );
    expect(
      await f.prisma.trainingSession.count({ where: { userId: athlete.id } }),
    ).toBe(7);
    await f.prisma.trainingPlanItem.update({
      where: { id: plan.sessions[0].trainingPlanItemId },
      data: { metadata: { durationMinutes: 50, schedule: { dayOffset: 2 } } },
    });
    await expect(
      f.prisma.$transaction((tx) =>
        createTrainingSessions(tx, plan.id, new Date()),
      ),
    ).rejects.toThrow('giorni duplicati');
    await f.prisma.trainingPlanItem.update({
      where: { id: plan.sessions[0].trainingPlanItemId },
      data: { metadata: { durationMinutes: 50 } },
    });
    await expect(
      f.prisma.$transaction((tx) =>
        createTrainingSessions(tx, plan.id, new Date()),
      ),
    ).rejects.toThrow('Schedule obbligatoria');
  });
  it('does not persist invalid schedule output even if an adapter bypasses normalization', async () => {
    const athlete = await f.user();
    const provider = f.app.get(AiProposalProviderService);
    const real = provider.generateTrainingProposal.bind(provider);
    jest
      .spyOn(provider, 'generateTrainingProposal')
      .mockImplementation(async (input) => {
        const result = await real(input);
        result.planItems[0].dayOffset = 14;
        return result;
      });
    const operation = await request(athlete.id);
    await lifecycle.resumeLifecycle(operation.id);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'ERROR',
      errorCode: 'INVALID_AI_OUTPUT',
    });
    expect(
      await f.prisma.trainingPlanRelease.count({
        where: { userId: athlete.id },
      }),
    ).toBe(0);
  });
  it('retries a failed next-window AI call from the scheduled sweep without another athlete request', async () => {
    const athlete = await f.user();
    const generate = jest.spyOn(
      f.app.get(AiProposalProviderService),
      'generateTrainingProposal',
    );
    const operation = await request(athlete.id);
    await lifecycle.resumeLifecycle(operation.id);
    const first = await f.prisma.trainingPlanRelease.findFirstOrThrow({
      where: { userId: athlete.id },
      include: {
        sessions: true,
        questionSets: {
          include: { questions: { include: { options: true } } },
        },
      },
    });
    const service = f.app.get(AthleteService);
    for (const session of first.sessions)
      await service.finish(athlete.id, session.id, 'COMPLETED', {
        completionRating: 4,
      });
    const qs = first.questionSets[0];
    const answersService = f.app.get(AnswersService);
    await answersService.submitTrainingBatch(
      { id: athlete.id, role: 'USER' },
      {
        questionSetId: qs.id,
        answers: qs.questions.map((q) => ({
          questionId: q.id,
          answerOptionId: q.options[0].id,
        })),
      },
    );
    expect((await service.home(athlete.id)).primaryAction.type).toBe(
      'WINDOW_COMPLETE',
    );
    jest
      .spyOn(dates, 'athleteDate')
      .mockReturnValue(first.endsOn!.toISOString().slice(0, 10));
    generate.mockRejectedValueOnce(new Error('provider timeout'));
    await lifecycle.drain();
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'ERROR',
      errorCode: 'AI_GENERATION_FAILED',
      preparingNext: true,
    });
    expect(
      (
        await f.prisma.trainingPlanRelease.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).cycleStatus,
    ).toBe('CLOSED');
    const next = await f.prisma.trainingLifecycleOperation.findUniqueOrThrow({
      where: { previousReleaseId: first.id },
    });
    await f.prisma.trainingLifecycleOperation.update({
      where: { id: next.id },
      data: { nextAttemptAt: new Date(0) },
    });
    await Promise.all([lifecycle.drain(), lifecycle.drain()]);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(
      await f.prisma.trainingPlanRelease.count({
        where: { previousReleaseId: first.id },
      }),
    ).toBe(1);
    expect(await lifecycle.current(athlete.id)).toMatchObject({
      status: 'READY',
      errorCode: null,
    });
  });
});

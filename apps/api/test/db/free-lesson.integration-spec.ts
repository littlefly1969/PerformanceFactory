import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FreeLessonsModule } from '../../src/free-lessons/free-lessons.module';
import { FreeLessonService } from '../../src/free-lessons/free-lesson.service';
import { FreeLessonAdminService } from '../../src/free-lessons/free-lesson-admin.service';
import { CoachLessonService } from '../../src/free-lessons/coach-lesson.service';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { CalibrationService } from '../../src/discovery/calibration/calibration.service';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { AssessmentEvaluationInput } from '../../src/ai-orchestrator/assessment-evaluation-model';
import {
  loadFreeLessonSettings,
  updateFreeLessonSettings,
} from '../../src/free-lessons/free-lesson-config';
import { DEFAULT_FREE_LESSON_SETTINGS } from '../../src/free-lessons/free-lesson-rules';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const AREAS = ['pf4-driver-0', 'pf4-driver-1'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Slice 4: crediti, micro-test, posti, attesa della lezione e feedback del coach su PostgreSQL. */
describe('Free lesson with PostgreSQL', () => {
  let prisma: PrismaService;
  let athletes: FreeLessonService;
  let admin: FreeLessonAdminService;
  let coaches: CoachLessonService;
  let calibration: CalibrationService;
  let flags: FeatureFlagsService;
  let ai: AiProposalProviderService;
  let partnerId: string;
  let adminId: string;
  let coachId: string;
  let otherCoachId: string;
  /** Confidence restituita dalla valutazione AI simulata. */
  let aiConfidence = 85;
  const inputs: AssessmentEvaluationInput[] = [];
  const users: string[] = [];
  const lessons: string[] = [];
  const microTests: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  const user = async (role: UserRole = UserRole.USER) => {
    const created = await prisma.user.create({
      data: {
        email: `free-lesson-${randomUUID()}@example.test`,
        password: 'x',
        role,
        firstName: 'Test',
        lastName: role,
      },
    });
    users.push(created.id);
    return created.id;
  };

  /** Atleta valutato con R aperta: livello stimato e confidence data per driver. */
  const athlete = async (
    confidences: number[],
    status = 'FREE_LEVEL_ESTIMATED',
  ) => {
    const id = await user();
    const answers: Record<string, string> = {};
    for (const [i, areaId] of AREAS.entries()) {
      const q = await prisma.userOnboardingQuestion.create({
        data: {
          userId: id,
          areaId,
          text: `Domanda ${i}`,
          orderIndex: i,
          optionsJson: [
            { value: '1', label: 'Poco', score: 30 },
            { value: '2', label: 'Molto', score: 70 },
          ],
          provider: 'configuration',
          model: 'test',
          promptVersion: 'test',
          promptHash: 'test',
          inputJson: {},
        },
      });
      answers[q.id] = '2';
    }
    await prisma.athleteDiscovery.create({
      data: {
        userId: id,
        version: 1n,
        draft: { answers: {} },
        configuration: { questions: [] },
        phase: 'ASSESSMENT',
        assessmentAnswers: answers,
      },
    });
    const now = new Date();
    await prisma.assessmentEvaluation.create({
      data: {
        userId: id,
        sequence: 1,
        summary: 's',
        overallConfidence: Math.round(
          confidences.reduce((sum, c) => sum + c, 0) / confidences.length,
        ),
        level: 'INTERMEDIATE',
        levelConfidence: 60,
        minScore: 0,
        maxScore: 100,
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
        inputJson: {},
        outputJson: {},
        areas: {
          create: AREAS.map((areaId, i) => ({
            areaId,
            score: 50,
            confidence: confidences[i],
            rationale: 'r',
            evidenceGaps: [],
          })),
        },
      },
    });
    await prisma.athleteCalibration.create({
      data: {
        userId: id,
        status,
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 30 * DAY_MS),
      },
    });
    return id;
  };

  const status = async (userId: string) =>
    (await prisma.athleteCalibration.findUniqueOrThrow({ where: { userId } }))
      .status;

  /** Lezione tra 3 giorni; `startNow` la porta nel passato per il feedback. */
  const lesson = async (capacity = 4) => {
    const created = await admin.createLesson(
      {
        partnerId,
        startsAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
        coachId,
        capacity,
      },
      adminId,
    );
    lessons.push(created.id);
    return created.id;
  };
  const startNow = (lessonId: string) =>
    prisma.freeLesson.update({
      where: { id: lessonId },
      data: { startsAt: new Date(Date.now() - 60 * 1000) },
    });

  const requested = async (confidences: number[]) => {
    const id = await athlete(confidences);
    await prisma.freeLessonSeat.create({
      data: { userId: id, partnerId, coachSharingAcceptedAt: new Date() },
    });
    return id;
  };

  beforeAll(async () => {
    process.env.AI_PROVIDER = 'stub';
    process.env.DATABASE_URL = getRequiredTestDatabaseUrl();
    await ensureTestDatabaseExists(process.env.DATABASE_URL);
    execFileSync('pnpm', ['prisma', 'migrate', 'deploy'], {
      cwd: resolve(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe',
    });
    const module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        FreeLessonsModule,
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    athletes = module.get(FreeLessonService);
    admin = module.get(FreeLessonAdminService);
    coaches = module.get(CoachLessonService);
    calibration = module.get(CalibrationService);
    flags = module.get(FeatureFlagsService);
    ai = module.get(AiProposalProviderService);
    jest.spyOn(ai, 'evaluateAssessment').mockImplementation((input) => {
      inputs.push(input);
      return Promise.resolve({
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
        inputJson: {},
        latencyMs: 1,
        output: {
          summary: 's',
          overallConfidence: aiConfidence,
          level: 'INTERMEDIATE',
          levelConfidence: 80,
          drivers: input.drivers.map((d) => ({
            areaId: d.areaId,
            score: 60,
            confidence: aiConfidence,
            rationale: 'r',
            evidenceGaps: [],
            commitment: 'MEDIUM',
          })),
        },
      });
    });
    adminId = await user(UserRole.ADMIN);
    coachId = await user(UserRole.PROFESSIONAL);
    otherCoachId = await user(UserRole.PROFESSIONAL);
    partnerId = (
      await prisma.partner.create({
        data: {
          code: `fl-${randomUUID().slice(0, 8)}`,
          name: 'Circolo test',
          freeLessonsEnabled: true,
        },
      })
    ).id;
    await flags.update(
      'free_lesson',
      { enabled: true, rolloutPercent: 100 },
      adminId,
    );
    await prisma.freeLessonConfig.deleteMany();
  });

  afterAll(async () => {
    await flags.update('free_lesson', { enabled: false }, adminId);
    await prisma.freeLessonConfig.deleteMany();
    await prisma.dataAccessAudit.deleteMany({
      where: { actorId: { in: users } },
    });
    await prisma.featureFlagChange.deleteMany({
      where: { actorId: { in: users } },
    });
    await prisma.coachLessonFeedback.deleteMany({
      where: { lessonId: { in: lessons } },
    });
    await prisma.freeLessonSeat.deleteMany({
      where: { userId: { in: users } },
    });
    await prisma.freeLesson.deleteMany({ where: { id: { in: lessons } } });
    await prisma.microTest.deleteMany({ where: { id: { in: microTests } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.partner.deleteMany({ where: { id: partnerId } });
    process.env.DATABASE_URL = originalUrl;
    await prisma.$disconnect();
  });

  it('credits each interaction once, also with parallel requests, and caps micro-tests per day', async () => {
    const id = await athlete([40, 50]);
    for (const sequence of [1, 2]) {
      const evaluation = await prisma.assessmentEvaluation.findFirstOrThrow({
        where: { userId: id },
      });
      await prisma.calibrationRound.create({
        data: {
          userId: id,
          sequence,
          status: 'EVALUATED',
          questionsJson: [],
          provider: 'stub',
          model: 'stub',
          promptHash: 'h',
          evaluationId: sequence === 1 ? evaluation.id : null,
        },
      });
    }
    const views = await Promise.all(
      Array.from({ length: 5 }, () => athletes.view(id)),
    );
    expect(views.map((v) => v.enabled && v.credits.balance)).toEqual(
      Array(5).fill(70),
    );
    expect(
      await prisma.interactionCreditEntry.count({ where: { userId: id } }),
    ).toBe(3);
    const first = views[0];
    expect(first.enabled && first.phase).toBe('LOCKED');
    expect(first.enabled && first.missing).toEqual(['CREDITS']);

    for (const n of [1, 2, 3]) {
      const test = await admin.createMicroTest({
        areaId: AREAS[0],
        title: `Bandeja ${n}`,
        instructions: 'Dieci bandeje: quante finiscono in campo?',
        options: [
          { value: 'low', label: 'Meno di 5', score: 30 },
          { value: 'high', label: '5 o più', score: 70 },
        ],
      });
      microTests.push(test.id);
    }
    const shown = await athletes.view(id);
    expect(shown.enabled && shown.microTests).toHaveLength(2);
    const results = await Promise.allSettled(
      microTests.map((testId) =>
        athletes.completeMicroTest(id, testId, 'high'),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    // Un reinvio dello stesso esito non conta due volte.
    const done = await prisma.microTestCompletion.findFirstOrThrow({
      where: { userId: id },
    });
    await athletes.completeMicroTest(id, done.microTestId, 'high');
    const after = await athletes.view(id);
    expect(after.enabled && after.credits.balance).toBe(90);
    expect(after.enabled && after.microTestsLeft).toBe(0);

    await updateFreeLessonSettings(prisma, { creditsToUnlock: 90 }, adminId);
    const eligible = await Promise.all([
      athletes.view(id),
      athletes.view(id),
      athletes.view(id),
    ]);
    expect(eligible[0].enabled && eligible[0].phase).toBe('ELIGIBLE');
    expect(
      await prisma.analyticsEvent.count({
        where: { userId: id, name: 'lesson_eligible' },
      }),
    ).toBe(1);
    await Promise.all([
      athletes.request(id, partnerId, true),
      athletes.request(id, partnerId, true),
    ]);
    const seat = await prisma.freeLessonSeat.findUniqueOrThrow({
      where: { userId: id },
    });
    expect(seat.status).toBe('REQUESTED');
    // Già dalla richiesta la lezione è il passaggio che chiude R e P.
    expect(await status(id)).toBe('FREE_LESSON_VALIDATION');
    await updateFreeLessonSettings(
      prisma,
      { creditsToUnlock: DEFAULT_FREE_LESSON_SETTINGS.creditsToUnlock },
      adminId,
    );
  });

  it('never fills a lesson beyond its capacity under concurrent assignments, and cancel keeps the request pending', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => requested([40, 50])),
    );
    const lessonId = await lesson(4);
    const results = await Promise.allSettled(
      ids.map((id) => admin.assign(lessonId, id)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
      ConflictException,
    );
    const seats = await prisma.freeLessonSeat.findMany({
      where: { lessonId, status: 'ASSIGNED' },
    });
    expect(seats).toHaveLength(4);
    for (const seat of seats)
      expect(await status(seat.userId)).toBe('FREE_LESSON_VALIDATION');
    // Riassegnare lo stesso atleta non cambia nulla.
    await admin.assign(lessonId, seats[0].userId);

    await admin.cancel(lessonId);
    for (const id of ids) {
      expect(
        (
          await prisma.freeLessonSeat.findUniqueOrThrow({
            where: { userId: id },
          })
        ).status,
      ).toBe('REQUESTED');
      // La richiesta resta: R continua ad aspettare la lezione.
      if (seats.some((seat) => seat.userId === id))
        expect(await status(id)).toBe('FREE_LESSON_VALIDATION');
    }
  });

  it('refuses a lesson too close to the calibration deadline or with R already closed', async () => {
    const late = await requested([40, 50]);
    await prisma.athleteCalibration.update({
      where: { userId: late },
      data: { deadlineAt: new Date(Date.now() + 4 * DAY_MS) },
    });
    const lessonId = await lesson();
    await expect(admin.assign(lessonId, late)).rejects.toThrow(
      'troppo vicina alla scadenza',
    );
    const closed = await requested([40, 50]);
    await prisma.athleteCalibration.update({
      where: { userId: closed },
      data: { status: 'CALIBRATION_COMPLETED' },
    });
    await expect(admin.assign(lessonId, closed)).rejects.toThrow(
      'livello stimato',
    );
  });

  it('holds R open until the coach feedback is evaluated, then closes at threshold', async () => {
    // Driver già sopra soglia: senza lezione la calibrazione si chiuderebbe.
    const id = await requested([80, 90]);
    const roundAthlete = await requested([40, 50]);
    const lessonId = await lesson();
    await admin.assign(lessonId, id);
    await admin.assign(lessonId, roundAthlete);
    await expect(calibration.openRound(id)).rejects.toMatchObject({
      response: { code: 'CALIBRATION_WAITING_LESSON' },
    });
    expect(await status(id)).toBe('FREE_LESSON_VALIDATION');

    // Un round valutato sopra soglia non chiude mentre il posto è assegnato.
    const round = await prisma.calibrationRound.create({
      data: {
        userId: roundAthlete,
        sequence: 1,
        questionsJson: [
          {
            id: 'q1',
            areaId: AREAS[0],
            text: 'Domanda di calibrazione',
            options: [
              { value: 'a', label: 'A', score: 40 },
              { value: 'b', label: 'B', score: 80 },
            ],
          },
        ],
        provider: 'stub',
        model: 'stub',
        promptHash: 'h',
      },
    });
    aiConfidence = 90;
    await calibration.answerRound(roundAthlete, round.id, { q1: 'b' });
    expect(await status(roundAthlete)).toBe('FREE_LESSON_VALIDATION');

    // Prima dell'inizio e da un altro coach il feedback non entra.
    const feedback = {
      userId: id,
      ratings: [{ areaId: AREAS[0], rating: 4 }],
      note: 'Buona lettura del gioco',
    };
    await expect(
      coaches.submitFeedback(coachId, lessonId, feedback),
    ).rejects.toThrow('non è ancora iniziata');
    await startNow(lessonId);
    await expect(
      coaches.submitFeedback(otherCoachId, lessonId, feedback),
    ).rejects.toBeInstanceOf(ForbiddenException);

    aiConfidence = 85;
    inputs.length = 0;
    const [first, replay] = await Promise.all([
      coaches.submitFeedback(coachId, lessonId, feedback),
      coaches.submitFeedback(coachId, lessonId, feedback),
    ]);
    expect([first.saved, replay.saved].sort()).toEqual([false, true]);
    expect(
      await prisma.coachLessonFeedback.count({ where: { userId: id } }),
    ).toBe(1);
    const evaluation = await prisma.assessmentEvaluation.findFirstOrThrow({
      where: { userId: id },
      orderBy: { sequence: 'desc' },
    });
    expect(evaluation.source).toBe('COACH_LESSON');
    expect(
      inputs[0].drivers
        .find((d) => d.areaId === AREAS[0])!
        .answers.find((a) => a.source === 'COACH_LESSON'),
    ).toMatchObject({
      optionScore: 75,
      answer: 'Avanzato. Nota del coach: Buona lettura del gioco',
    });
    expect(
      (
        await prisma.coachLessonFeedback.findFirstOrThrow({
          where: { userId: id },
        })
      ).evaluationId,
    ).toBe(evaluation.id);
    const closed = await prisma.athleteCalibration.findUniqueOrThrow({
      where: { userId: id },
    });
    expect(closed.status).toBe('CALIBRATION_COMPLETED');
    expect(closed.completionReason).toBe('CONFIDENCE_REACHED');
    expect(
      await prisma.analyticsEvent.count({
        where: {
          userId: id,
          name: { in: ['lesson_completed', 'coach_feedback_submitted'] },
        },
      }),
    ).toBe(2);
    expect(
      await prisma.dataAccessAudit.count({
        where: { actorId: coachId, targetUserId: id },
      }),
    ).toBe(0);
    const view = await coaches.lessons(coachId);
    expect(
      view.lessons.find((l) => l.id === lessonId)!.participants,
    ).toHaveLength(2);
    expect(
      await prisma.dataAccessAudit.count({
        where: { actorId: coachId, targetUserId: id },
      }),
    ).toBe(1);

    // Assenza: il beneficio è consumato e R torna a poter chiudersi.
    await coaches.markNoShow(coachId, lessonId, roundAthlete);
    expect(await status(roundAthlete)).toBe('FREE_LEVEL_ESTIMATED');
    expect(
      (await prisma.freeLesson.findUniqueOrThrow({ where: { id: lessonId } }))
        .status,
    ).toBe('COMPLETED');
    await expect(
      athletes.request(roundAthlete, partnerId, true),
    ).rejects.toMatchObject({ response: { phase: 'NO_SHOW' } });
  });

  it('lets the athlete withdraw before the lesson and frees the seat', async () => {
    const id = await requested([40, 50]);
    const lessonId = await lesson(1);
    await admin.assign(lessonId, id);
    await athletes.withdraw(id);
    expect(await status(id)).toBe('FREE_LEVEL_ESTIMATED');
    // Anche una richiesta mai assegnata, ritirata, libera R.
    const pending = await requested([40, 50]);
    await prisma.athleteCalibration.update({
      where: { userId: pending },
      data: { status: 'FREE_LESSON_VALIDATION' },
    });
    await athletes.withdraw(pending);
    expect(await status(pending)).toBe('FREE_LEVEL_ESTIMATED');
    const other = await requested([40, 50]);
    await admin.assign(lessonId, other);
    expect(
      await prisma.freeLessonSeat.count({
        where: { lessonId, status: 'ASSIGNED' },
      }),
    ).toBe(1);
  });

  it('hides everything while the feature flag is off', async () => {
    const id = await athlete([40, 50]);
    await flags.update('free_lesson', { enabled: false }, adminId);
    expect(await athletes.view(id)).toEqual({ enabled: false });
    await expect(athletes.request(id, partnerId, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(
      await prisma.interactionCreditEntry.count({ where: { userId: id } }),
    ).toBe(0);
    await flags.update(
      'free_lesson',
      { enabled: true, rolloutPercent: 100 },
      adminId,
    );
    expect((await loadFreeLessonSettings(prisma)).creditsToUnlock).toBe(100);
  });
});

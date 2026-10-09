import { Test } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../src/prisma/prisma.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DiscoveryModule } from '../../src/discovery/discovery.module';
import { CalibrationService } from '../../src/discovery/calibration/calibration.service';
import { FeatureFlagsService } from '../../src/features/feature-flags.service';
import { AiProposalProviderService } from '../../src/ai-orchestrator/proposal-provider.service';
import { CalibrationQuestionsInput } from '../../src/ai-orchestrator/calibration-questions';
import { MicroTestInput } from '../../src/ai-orchestrator/micro-test-generation';
import { AssessmentEvaluationInput } from '../../src/ai-orchestrator/assessment-evaluation-model';
import { getRequiredTestDatabaseUrl } from '../utils/db-test-guard';
import { ensureTestDatabaseExists } from '../utils/ensure-test-database';

const AREAS = ['pf4-driver-0', 'pf4-driver-1'];
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Micro-test come passo del motore dell'assessment (PF-FS-PREPAYWALL §4.4):
 * l'AI sceglie il driver, il generatore scrive e valida il test, l'esito è un
 * self-report che entra nella rivalutazione. AT-12, AT-13.
 */
describe('Micro-test engine step with PostgreSQL', () => {
  let prisma: PrismaService;
  let calibration: CalibrationService;
  let flags: FeatureFlagsService;
  let ai: AiProposalProviderService;
  let stepSpy: jest.SpiedFunction<
    AiProposalProviderService['generateCalibrationQuestions']
  >;
  let testSpy: jest.SpiedFunction<
    AiProposalProviderService['generateMicroTests']
  >;
  let adminId: string;
  const steps: CalibrationQuestionsInput[] = [];
  const tests: MicroTestInput[] = [];
  const evaluations: AssessmentEvaluationInput[] = [];
  const users: string[] = [];
  const originalUrl = process.env.DATABASE_URL;

  const user = async (role: UserRole = UserRole.USER) => {
    const created = await prisma.user.create({
      data: {
        email: `micro-step-${randomUUID()}@example.test`,
        password: 'x',
        role,
        firstName: 'Riservato',
        lastName: role,
      },
    });
    users.push(created.id);
    return created.id;
  };

  /** Atleta in calibrazione, valutato una volta, sotto la regola su entrambi i driver. */
  const athlete = async () => {
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
    await prisma.assessmentEvaluation.create({
      data: {
        userId: id,
        sequence: 1,
        summary: 's',
        overallConfidence: 30,
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
          create: AREAS.map((areaId) => ({
            areaId,
            score: 50,
            confidence: 30,
            rationale: 'r',
            evidenceGaps: ['Manca una prova pratica.'],
          })),
        },
      },
    });
    const now = new Date();
    await prisma.athleteCalibration.create({
      data: {
        userId: id,
        status: 'FREE_CALIBRATING',
        startedAt: now,
        deadlineAt: new Date(now.getTime() + 30 * DAY_MS),
      },
    });
    return id;
  };

  /** Il motore decide un micro-test sul primo driver al prossimo passo. */
  const proposeMicroTest = () =>
    stepSpy.mockImplementationOnce((input) => {
      steps.push(input);
      return Promise.resolve({
        action: 'PROPOSE_MICRO_TEST',
        targetAreas: [AREAS[0]],
        rationale: 'Le dichiarazioni sul driver non bastano.',
        questions: [],
        provider: 'stub',
        model: 'deterministic-stub',
        promptHash: 'step-hash',
        latencyMs: 1,
      });
    });

  const openRound = (userId: string) =>
    prisma.calibrationRound.findFirstOrThrow({
      where: { userId, status: 'OPEN' },
    });

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
        DiscoveryModule,
        ThrottlerModule.forRoot([{ name: 'default', limit: 100, ttl: 60000 }]),
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    await module.init();
    prisma = module.get(PrismaService);
    calibration = module.get(CalibrationService);
    flags = module.get(FeatureFlagsService);
    ai = module.get(AiProposalProviderService);
    const step = ai.generateCalibrationQuestions.bind(ai);
    stepSpy = jest
      .spyOn(ai, 'generateCalibrationQuestions')
      .mockImplementation((input) => {
        steps.push(input);
        return step(input);
      });
    const generate = ai.generateMicroTests.bind(ai);
    testSpy = jest
      .spyOn(ai, 'generateMicroTests')
      .mockImplementation((input) => {
        tests.push(input);
        return generate(input);
      });
    const evaluate = ai.evaluateAssessment.bind(ai);
    jest.spyOn(ai, 'evaluateAssessment').mockImplementation((input) => {
      evaluations.push(input);
      return evaluate(input);
    });
    adminId = await user(UserRole.ADMIN);
    await flags.update('free_lesson', { enabled: false }, adminId);
  });

  afterAll(async () => {
    await prisma.featureFlagChange.deleteMany({
      where: { actorId: { in: users } },
    });
    // Round, test su misura ed eventi seguono l'atleta.
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    process.env.DATABASE_URL = originalUrl;
    await prisma.$disconnect();
  });

  it('AT-12: proposes a validated micro-test and evaluates its self-reported outcome', async () => {
    const id = await athlete();
    proposeMicroTest();
    await calibration.openRound(id);
    // L'AI decide; riceve i conteggi e l'indicazione del back office (0).
    expect(steps.at(-1)!.microTestBalance).toEqual({
      questionsPerMicroTest: 0,
      microTestsDone: 0,
      microTestsSkipped: 0,
      questionsAnswered: 0,
    });

    const round = await openRound(id);
    expect(round).toMatchObject({
      action: 'PROPOSE_MICRO_TEST',
      targetAreas: [AREAS[0]],
    });
    const [question] = round.questionsJson as Array<{
      id: string;
      areaId: string;
      text: string;
      options: { value: string; score: number }[];
      microTest: { id: string; promptHash: string; physicalLoad: string };
    }>;
    expect(question.areaId).toBe(AREAS[0]);
    // Provenienza registrata: il test esiste per l'atleta, fuori dal catalogo.
    expect(question.microTest.promptHash).toBeTruthy();
    expect(
      await prisma.microTest.findUniqueOrThrow({
        where: { id: question.microTest.id },
      }),
    ).toMatchObject({ userId: id, areaId: AREAS[0], title: question.text });

    // Il generatore riceve il driver, il motivo del passo e la storia, senza identità.
    const input = tests.at(-1)!;
    expect(input.targets.map((t) => t.areaId)).toEqual([AREAS[0]]);
    expect(input.reason).toBe('Le dichiarazioni sul driver non bastano.');
    expect(input.targets[0].evidence[0].source).toBe('ASSESSMENT');
    expect(JSON.stringify(input)).not.toMatch(/example\.test|Riservato/);

    // L'atleta vede istruzioni e sicurezza, non punteggi né provenienza.
    const view = await calibration.view(id);
    expect(view!.round).toMatchObject({ action: 'PROPOSE_MICRO_TEST' });
    const shown = view!.round!.questions[0];
    expect(shown.microTest).toEqual({
      instructions: expect.any(String) as string,
      durationMinutes: 10,
      safetyNotes: expect.any(String) as string,
    });
    expect(JSON.stringify(shown)).not.toMatch(/score|promptHash|provider/);

    await calibration.answerRound(id, round.id, {
      [question.id]: question.options[2].value,
    });
    const evaluated = evaluations.at(-1)!;
    const evidence = evaluated.drivers
      .find((d) => d.areaId === AREAS[0])!
      .answers.find((a) => a.source === 'MICRO_TEST')!;
    expect(evidence.question).toContain(`Micro-test «${question.text}»`);
    expect(evidence.answer).toContain("(esito riportato dall'atleta)");
    expect(evidence.optionScore).toBe(question.options[2].score);

    // Diagnostica senza testi.
    const events = await prisma.analyticsEvent.findMany({
      where: { userId: id, name: { startsWith: 'ai_micro_test' } },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => e.name)).toEqual([
      'ai_micro_test_presented',
      'ai_micro_test_completed',
    ]);
    expect(events[0].properties).toEqual({
      area_id: AREAS[0],
      round_sequence: 1,
    });
    expect(JSON.stringify(events)).not.toContain(question.text);
  });

  it('AT-13: never shows a micro-test the generator rejected, and never falls back to the catalog', async () => {
    const id = await athlete();
    proposeMicroTest();
    testSpy.mockRejectedValueOnce(
      new BadGatewayException({
        code: 'INVALID_MICRO_TESTS',
        message: 'Non siamo riusciti a preparare i micro-test. Riprova.',
      }),
    );
    await expect(calibration.openRound(id)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(await prisma.calibrationRound.count({ where: { userId: id } })).toBe(
      0,
    );
    expect(await prisma.microTest.count({ where: { userId: id } })).toBe(0);
    // Il lease è rilasciato: si riprova subito.
    proposeMicroTest();
    await calibration.openRound(id);
    expect((await openRound(id)).action).toBe('PROPOSE_MICRO_TEST');
  });

  it('lets the athlete skip a micro-test, without evidence, and tells the engine', async () => {
    const id = await athlete();
    proposeMicroTest();
    await calibration.openRound(id);
    const round = await openRound(id);
    const [{ text }] = round.questionsJson as { text: string }[];
    await calibration.skipMicroTest(id, round.id);
    await calibration.skipMicroTest(id, round.id);
    expect(
      await prisma.calibrationRound.findUniqueOrThrow({
        where: { id: round.id },
      }),
    ).toMatchObject({ status: 'SKIPPED', evaluationId: null });

    await calibration.openRound(id);
    const next = await openRound(id);
    expect(next.action).toBe('ASK_GROUP');
    const target = steps.at(-1)!.targets.find((t) => t.areaId === AREAS[0])!;
    expect(target.microTests).toEqual([`${text} (saltato)`]);
    expect(steps.at(-1)!.microTestBalance).toMatchObject({
      microTestsDone: 0,
      microTestsSkipped: 1,
    });
    // Solo un micro-test si salta; un round di un altro atleta non si trova.
    await expect(calibration.skipMicroTest(id, next.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      calibration.skipMicroTest(await athlete(), round.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

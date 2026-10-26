import {
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import { resolveVideo } from '../../coaching-videos/coaching-videos';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { performanceDriverName as driverName } from '../../performance/performance-display';
import { PrismaService } from '../../prisma/prisma.service';
import { SituationAnswerDto } from './dto/calibration.dto';
import { situationFeedback } from './micro-test-step';

/** Valore della risposta corretta di una situazione di gioco. */
const correctValue = (q: CalibrationQuestion) =>
  q.microTest?.situation?.options.find((o) => o.correct)?.value;

/**
 * Micro-test dal lato dell'atleta: la spiegazione del coach subito dopo ogni
 * situazione di gioco, e dopo la valutazione il risultato sul driver con la
 * confidenza prima e dopo e il video scelto dall'AI (dall'archivio, o il
 * titolo del video ideale finché l'archivio non lo ha).
 */
@Injectable()
export class MicroTestSessionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fissa la risposta a una situazione e restituisce la spiegazione. La
   * risposta non si cambia dopo averla vista: il round la valuta così.
   */
  async answerSituation(
    userId: string,
    roundId: string,
    questionId: string,
    value: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "CalibrationRound" WHERE "id" = ${roundId} FOR UPDATE`;
      const round = await tx.calibrationRound.findFirst({
        where: { id: roundId, userId, action: 'PROPOSE_MICRO_TEST' },
      });
      if (!round) throw new NotFoundException('Micro-test non trovato');
      const questions = round.questionsJson as CalibrationQuestion[];
      const q = questions.find((item) => item.id === questionId);
      if (!q?.microTest?.situation)
        throw new BadRequestException('Situazione non trovata');
      const feedback = situationFeedback(q, value);
      if (!feedback) throw new BadRequestException('Risposta non valida');
      const saved = (round.answersJson ?? {}) as Record<string, unknown>;
      if (saved[questionId] !== undefined) {
        if (saved[questionId] !== value)
          throw new ConflictException('Hai già risposto a questa situazione');
        return feedback;
      }
      if (round.status !== 'OPEN')
        throw new ConflictException('Il micro-test è già in valutazione');
      await tx.calibrationRound.update({
        where: { id: roundId },
        data: {
          answersJson: {
            ...saved,
            [questionId]: value,
          } as Prisma.InputJsonValue,
        },
      });
      return feedback;
    });
  }

  /** Risultato del micro-test valutato; prima della valutazione solo lo stato. */
  async result(userId: string, roundId: string) {
    const round = await this.prisma.calibrationRound.findFirst({
      where: { id: roundId, userId, action: 'PROPOSE_MICRO_TEST' },
    });
    if (!round) throw new NotFoundException('Micro-test non trovato');
    const questions = round.questionsJson as CalibrationQuestion[];
    const test = questions[0]?.microTest;
    if (!test) throw new NotFoundException('Micro-test non trovato');
    const areaId = questions[0].areaId;
    const area = await this.prisma.area.findUnique({
      where: { id: areaId },
      select: { name: true },
    });
    const base = {
      status: round.status,
      format: test.situation
        ? ('SITUATIONAL' as const)
        : ('PRACTICAL' as const),
      title: test.title ?? questions[0].text,
      area: { id: areaId, name: area ? driverName(area.name) : '' },
    };
    if (round.status !== 'EVALUATED' || !round.evaluationId) return base;
    const after = await this.prisma.assessmentEvaluation.findUniqueOrThrow({
      where: { id: round.evaluationId },
      select: { sequence: true, areas: { where: { areaId } } },
    });
    const before = await this.prisma.assessmentEvaluation.findFirst({
      where: { userId, sequence: { lt: after.sequence } },
      orderBy: { sequence: 'desc' },
      select: { areas: { where: { areaId } } },
    });
    const answers = (round.answersJson ?? {}) as Record<string, unknown>;
    const missed = questions.filter(
      (q) => q.microTest?.situation && answers[q.id] !== correctValue(q),
    );
    const situations = questions.filter((q) => q.microTest?.situation).length;
    // Il video della prima situazione sbagliata, altrimenti quello del test.
    const choice =
      missed.find((q) => q.microTest?.situation?.video)?.microTest?.situation
        ?.video ?? test.video;
    return {
      ...base,
      confidence: {
        before: before?.areas[0]?.confidence ?? null,
        after: after.areas[0]?.confidence ?? null,
      },
      ...(situations
        ? { correct: situations - missed.length, total: situations }
        : {}),
      summary: after.areas[0]?.rationale ?? '',
      video: await resolveVideo(this.prisma, choice ?? undefined),
    };
  }
}

@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey/calibration')
@UseGuards(AuthenticatedGuard)
export class MicroTestSessionController {
  constructor(private readonly session: MicroTestSessionService) {}

  @ApiOperation({
    summary:
      'Risponde a una situazione del micro-test e riceve la spiegazione del coach',
  })
  @Post('situation')
  answerSituation(
    @Req() req: { user: { id: string } },
    @Body() body: SituationAnswerDto,
  ) {
    return this.session.answerSituation(
      req.user.id,
      body.roundId,
      body.questionId,
      body.value,
    );
  }

  @ApiOperation({
    summary: 'Risultato del micro-test: confidenza del driver e video scelto',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get('micro-test/:roundId')
  result(
    @Req() req: { user: { id: string } },
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ) {
    return this.session.result(req.user.id, roundId);
  }
}

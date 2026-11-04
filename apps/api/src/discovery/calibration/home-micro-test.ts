import {
  Controller,
  Get,
  Header,
  Injectable,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalibrationQuestion } from '../../ai-orchestrator/calibration-questions';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { loadFreeLessonSettings } from '../../free-lessons/free-lesson-config';
import { performanceDriverName as driverName } from '../../performance/performance-display';
import { PrismaService } from '../../prisma/prisma.service';
import { publicRound } from './calibration-closing';
import { isCalibrationClosed } from './calibration-rules';
import { CalibrationService } from './calibration.service';
import { openHomeMicroTest } from './home-micro-test-prepare';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY = 5;

/** Giorno di calendario in Italia (AAAA-MM-GG): la serie segue i giorni dell'atleta. */
export const romeDay = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const shift = (day: string, days: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);

/**
 * Giorni di fila con almeno un'attività (micro-test, domande o assessment),
 * fino a oggi o a ieri se oggi non c'è ancora nulla, e la settimana da lunedì.
 */
export function streakOf(active: Date[], now: Date) {
  const days = new Set(active.map(romeDay));
  const today = romeDay(now);
  let day = days.has(today) ? today : shift(today, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = shift(day, -1);
  }
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = shift(today, -weekday);
  return {
    days: count,
    week: Array.from({ length: 7 }, (_, i) => days.has(shift(monday, i))),
  };
}

const testOf = (round: { questionsJson: unknown }) => {
  const questions = round.questionsJson as CalibrationQuestion[];
  return { first: questions[0], test: questions[0]?.microTest };
};

/**
 * Micro-test della home (fase gratuita), fuori dal ciclo di calibrazione:
 * quello pronto, la serie di giorni e gli ultimi fatti. L'esito aggiorna il
 * profilo provvisorio, quindi a calibrazione chiusa non c'è.
 */
@Injectable()
export class HomeMicroTestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calibration: CalibrationService,
  ) {}

  async view(userId: string, now = new Date()) {
    const calibration = await this.calibration.expireIfDue(userId, now);
    const [rounds, initial, settings, credits] = await Promise.all([
      this.prisma.calibrationRound.findMany({
        where: { userId, status: 'EVALUATED' },
        orderBy: { sequence: 'desc' },
        select: {
          id: true,
          action: true,
          answeredAt: true,
          evaluatedAt: true,
          questionsJson: true,
        },
      }),
      this.prisma.assessmentEvaluation.findUnique({
        where: { userId_sequence: { userId, sequence: 1 } },
        select: { createdAt: true },
      }),
      loadFreeLessonSettings(this.prisma),
      this.prisma.interactionCreditEntry.findMany({
        where: { userId, action: 'MICRO_TEST' },
        select: { sourceKey: true, points: true },
      }),
    ]);
    const points = new Map(credits.map((c) => [c.sourceKey, c.points]));
    const streak = streakOf(
      [
        ...(initial ? [initial.createdAt] : []),
        ...rounds.flatMap((r) => (r.answeredAt ? [r.answeredAt] : [])),
      ],
      now,
    );
    const history = rounds
      .filter((r) => r.action === 'PROPOSE_MICRO_TEST')
      .slice(0, HISTORY)
      .map((r) => {
        const { first, test } = testOf(r);
        return {
          roundId: r.id,
          completedAt: r.evaluatedAt ?? r.answeredAt,
          title: test?.title ?? first?.text ?? '',
          points: points.get(`round:${r.id}`) ?? settings.creditsMicroTest,
        };
      });
    const base = { streak, history };
    if (!calibration || isCalibrationClosed(calibration.status))
      return { ...base, status: 'UNAVAILABLE' as const, test: null };
    const open = await openHomeMicroTest(this.prisma, userId);
    if (!open) return { ...base, status: 'PREPARING' as const, test: null };
    const { first, test } = testOf(open);
    const area = await this.prisma.area.findUnique({
      where: { id: first.areaId },
      select: { id: true, name: true },
    });
    return {
      ...base,
      status:
        open.status === 'EVALUATING'
          ? ('EVALUATING' as const)
          : ('READY' as const),
      test: {
        roundId: open.id,
        title: test?.title ?? first.text,
        area: { id: first.areaId, name: area ? driverName(area.name) : '' },
        durationMinutes: test?.durationMinutes ?? null,
        format: test?.situation
          ? ('SITUATIONAL' as const)
          : ('PRACTICAL' as const),
        points: settings.creditsMicroTest,
        round: publicRound(open),
      },
    };
  }

  /** Prepara il micro-test se manca (l'AI lavora), poi la vista aggiornata. */
  async prepare(userId: string) {
    await this.calibration.prepareMicroTest(userId);
    return this.view(userId);
  }
}

@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey/micro-test')
@UseGuards(AuthenticatedGuard)
export class HomeMicroTestController {
  constructor(private readonly home: HomeMicroTestService) {}

  @ApiOperation({
    summary:
      'Micro-test della home: quello pronto, i giorni di fila e gli ultimi fatti',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get()
  view(@Req() req: { user: { id: string } }) {
    return this.home.view(req.user.id);
  }

  @ApiOperation({
    summary:
      "Prepara il prossimo micro-test se manca: l'AI sceglie fra le aree meno sviluppate",
  })
  @Post()
  prepare(@Req() req: { user: { id: string } }) {
    return this.home.prepare(req.user.id);
  }
}

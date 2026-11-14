import {
  Body,
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
import {
  MICRO_TEST_FILTERS,
  MicroTestFilter,
} from '../../ai-orchestrator/micro-test-practical';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { loadFreeLessonSettings } from '../../free-lessons/free-lesson-config';
import { performanceDriverName as driverName } from '../../performance/performance-display';
import { PrismaService } from '../../prisma/prisma.service';
import { publicRound } from './calibration-closing';
import { loadCalibrationSettings } from './calibration-config';
import { isCalibrationClosed } from './calibration-rules';
import { CalibrationService } from './calibration.service';
import { MicroTestPrepareDto } from './dto/calibration.dto';
import {
  SLOT_STALE_MS,
  openHomeMicroTests,
  romeDay,
  roundFilter,
} from './home-micro-test-prepare';

export { romeDay };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Micro-test già fatti mostrati per filtro. */
const HISTORY = 5;

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
type FilterViews = Awaited<ReturnType<HomeMicroTestService['filterViews']>>;

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
          microTestSlot: { select: { filter: true } },
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
    const done = rounds
      .filter((r) => r.action === 'PROPOSE_MICRO_TEST')
      .map((r) => ({ round: r, filter: roundFilter(r) }));
    // Gli ultimi fatti di ciascun filtro: ogni filtro ha il suo archivio.
    const history = MICRO_TEST_FILTERS.flatMap((filter) =>
      done
        .filter((d) => d.filter === filter)
        .slice(0, HISTORY)
        .map(({ round: r }) => {
          const { first, test } = testOf(r);
          return {
            roundId: r.id,
            filter,
            completedAt: r.evaluatedAt ?? r.answeredAt,
            title: test?.title ?? first?.text ?? '',
            points: points.get(`round:${r.id}`) ?? settings.creditsMicroTest,
          };
        }),
    );
    const base = { streak, history };
    if (!calibration || isCalibrationClosed(calibration.status))
      return {
        ...base,
        status: 'UNAVAILABLE' as const,
        test: null,
        filters: [] as FilterViews['filters'],
        limit: null,
      };
    const { filters, limit } = await this.filterViews(
      userId,
      now,
      settings.creditsMicroTest,
    );
    // Riepilogo per la home: il primo pronto, poi quello in valutazione.
    const summary =
      filters.find((f) => f.status === 'READY') ??
      filters.find((f) => f.status === 'EVALUATING') ??
      filters.find((f) => f.status === 'PREPARING') ??
      filters[0];
    return {
      ...base,
      status: summary.status,
      test: summary.test,
      filters,
      limit,
    };
  }

  /**
   * Stato di ciascun filtro: il test aperto, oppure PREPARING finché ha posti
   * oggi (o una preparazione in corso), altrimenti DONE_TODAY.
   */
  private async filterViews(userId: string, now: Date, points: number) {
    const [open, slots, config] = await Promise.all([
      openHomeMicroTests(this.prisma, userId),
      this.prisma.microTestSlot.findMany({
        where: {
          userId,
          OR: [{ day: romeDay(now) }, { status: 'PREPARING' }],
        },
        select: { filter: true, day: true, status: true, claimedAt: true },
      }),
      loadCalibrationSettings(this.prisma),
    ]);
    const limit = config.microTestsPerDay;
    const areaIds = [
      ...new Set(open.flatMap((r) => testOf(r).first?.areaId ?? [])),
    ];
    const areas = await this.prisma.area.findMany({
      where: { id: { in: areaIds } },
      select: { id: true, name: true },
    });
    const filters = MICRO_TEST_FILTERS.map((filter) => {
      const round = open.find((r) => r.filter === filter);
      const used = slots.filter(
        (s) => s.filter === filter && s.day === romeDay(now),
      ).length;
      const preparing = slots.some(
        (s) =>
          s.filter === filter &&
          s.status === 'PREPARING' &&
          s.claimedAt.getTime() > now.getTime() - SLOT_STALE_MS,
      );
      const state = { filter, usedToday: Math.min(used, limit), limit };
      if (round) {
        const { first, test } = testOf(round);
        const area = areas.find((a) => a.id === first.areaId);
        return {
          ...state,
          status:
            round.status === 'EVALUATING'
              ? ('EVALUATING' as const)
              : ('READY' as const),
          test: {
            roundId: round.id,
            filter,
            title: test?.title ?? first.text,
            area: { id: first.areaId, name: area ? driverName(area.name) : '' },
            durationMinutes: test?.durationMinutes ?? null,
            format: test?.situation
              ? ('SITUATIONAL' as const)
              : ('PRACTICAL' as const),
            points,
            round: publicRound(round),
          },
        };
      }
      // Senza test aperto: si prepara finché il filtro ha posti oggi.
      return {
        ...state,
        status:
          preparing || used < limit
            ? ('PREPARING' as const)
            : ('DONE_TODAY' as const),
        test: null,
      };
    });
    return { filters, limit };
  }

  /** Prepara il micro-test del filtro se manca (l'AI lavora), poi la vista aggiornata. */
  async prepare(userId: string, filter: MicroTestFilter = 'THEORY') {
    await this.calibration.prepareMicroTest(userId, filter);
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
      'Micro-test della home per filtro: quello pronto, i posti del giorno, i giorni di fila e gli ultimi fatti',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get()
  view(@Req() req: { user: { id: string } }) {
    return this.home.view(req.user.id);
  }

  @ApiOperation({
    summary:
      "Prepara il micro-test del filtro (Teorici, Sul campo, Fuori dal campo) se manca e se il limite del giorno lo consente: l'AI sceglie fra le aree meno sviluppate",
  })
  @Post()
  prepare(
    @Req() req: { user: { id: string } },
    @Body() body: MicroTestPrepareDto,
  ) {
    return this.home.prepare(req.user.id, body?.filter ?? 'THEORY');
  }
}

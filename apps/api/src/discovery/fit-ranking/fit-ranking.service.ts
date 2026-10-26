import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CalibrationService } from '../calibration/calibration.service';
import { dropStaleBank } from '../initial-question-bank';
import { journeyLeaseActive } from '../journey-lease';
import {
  FIT_RANKING_OPTIONS,
  FitRankingValues,
  fitRankingProblems,
  loadFitRanking,
  normalizeCardNumber,
  saveFitRanking,
} from './fit-ranking';

/**
 * Classifica FIT vista e corretta dall'atleta, in qualunque momento. Una
 * classifica cambiata fa ricalcolare la R sulle stesse evidenze; se il
 * ricalcolo non riesce, salvare di nuovo lo riprova.
 */
@Injectable()
export class FitRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calibration: CalibrationService,
  ) {}

  async view(userId: string) {
    const ranking = await loadFitRanking(this.prisma, userId);
    return {
      ranking: ranking && {
        padelCurrent: ranking.padelCurrent,
        padelBest: ranking.padelBest,
        tennisCurrent: ranking.tennisCurrent,
        tennisBest: ranking.tennisBest,
        cardNumber: ranking.cardNumber,
        updatedAt: ranking.createdAt,
      },
      options: FIT_RANKING_OPTIONS,
      recalculationPending: this.pending(ranking),
    };
  }

  async update(
    userId: string,
    body: { [K in keyof FitRankingValues]?: unknown },
  ) {
    const declared = {
      padelCurrent: body.padelCurrent,
      padelBest: body.padelBest,
      tennisCurrent: body.tennisCurrent,
      tennisBest: body.tennisBest,
      cardNumber: body.cardNumber,
    } as Partial<FitRankingValues>;
    const problems = fitRankingProblems(declared);
    if (problems.length) throw new BadRequestException(problems[0]);
    const values = {
      ...declared,
      cardNumber: normalizeCardNumber(body.cardNumber) ?? null,
    } as FitRankingValues;
    await this.prisma.$transaction(async (tx) => {
      // Stesso lock del lease del percorso: mentre l'AI scrive le domande o fa
      // la prima valutazione con la classifica di prima, non si cambia.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const [discovery, evaluated] = await Promise.all([
        tx.athleteDiscovery.findUnique({
          where: { userId },
          select: { operationAt: true },
        }),
        tx.assessmentEvaluation.count({ where: { userId } }),
      ]);
      if (!evaluated && journeyLeaseActive(discovery?.operationAt ?? null))
        throw new ConflictException(
          'Stiamo elaborando le tue risposte: riprova tra poco.',
        );
      const changed = await saveFitRanking(
        tx,
        userId,
        values,
        'PROFILE',
        evaluated > 0,
      );
      // Prima della valutazione le domande dei driver sono su misura per la
      // classifica: se cambia, l'AI le riscrive.
      if (changed && !evaluated) await dropStaleBank(tx, userId);
    });
    // Prima della prima valutazione la classifica entra già nel suo input.
    if (this.pending(await loadFitRanking(this.prisma, userId)))
      await this.calibration.reevaluateForRanking(userId);
    return this.view(userId);
  }

  /** Classifica cambiata dopo una valutazione, con R non ancora ricalcolata. */
  private pending(ranking: { recalculatedAt: Date | null } | null) {
    return !!ranking && !ranking.recalculatedAt;
  }
}

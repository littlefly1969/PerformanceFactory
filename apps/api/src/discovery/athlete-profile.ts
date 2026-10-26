import {
  Controller,
  Get,
  Header,
  Injectable,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { loadUserSportSelection } from '../onboarding/onboarding-sports';
import { PrismaService } from '../prisma/prisma.service';
import { discoveryContext } from './discovery-context';

/**
 * Ampiezza dell'intervallo di R globale a confidenza zero, come frazione
 * della scala: si stringe man mano che la confidenza complessiva sale.
 */
export const GLOBAL_R_SPREAD = 0.2;
/** Peso minimo di un driver: anche un'area poco nota conta un poco. */
const MIN_WEIGHT = 5;

type Driver = { score: number; confidence: number };

/**
 * Sintesi globale di R, provvisoria finché manca la Parte C: non è la media
 * dei driver ma la media pesata per la loro confidenza, con un intervallo
 * che dipende dalla confidenza complessiva.
 */
export function globalR(
  drivers: Driver[],
  overallConfidence: number,
  scale: { min: number; max: number },
) {
  if (!drivers.length) return null;
  const weights = drivers.map((d) => Math.max(d.confidence, MIN_WEIGHT));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const value =
    drivers.reduce((sum, d, i) => sum + d.score * weights[i], 0) / total;
  const confidence = Math.max(0, Math.min(100, overallConfidence));
  const half =
    ((100 - confidence) / 100) * (scale.max - scale.min) * GLOBAL_R_SPREAD;
  const clip = (n: number) => Math.max(scale.min, Math.min(scale.max, n));
  return {
    value: Math.round(value),
    low: Math.round(clip(value - half)),
    high: Math.round(clip(value + half)),
    confidence: Math.round(confidence),
    provisional: true,
  };
}

/** Risposta della discovery su da quanto tempo l'atleta gioca, se c'è. */
const EXPERIENCE = /da quanto|anni di gioco|esperienz/i;

/**
 * Intestazione del profilo dell'atleta: sport, esperienza dichiarata nella
 * discovery e sintesi globale di R dall'ultima valutazione.
 */
@Injectable()
export class AthleteProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async view(userId: string) {
    const [user, selection, context, evaluation] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { firstName: true },
      }),
      loadUserSportSelection(this.prisma, userId).catch(() => null),
      discoveryContext(this.prisma, userId),
      this.prisma.assessmentEvaluation.findFirst({
        where: { userId },
        orderBy: { sequence: 'desc' },
        select: {
          overallConfidence: true,
          minScore: true,
          maxScore: true,
          areas: { select: { score: true, confidence: true } },
        },
      }),
    ]);
    const index =
      context?.templates.findIndex((t) => EXPERIENCE.test(t.label)) ?? -1;
    const answer = index >= 0 ? context!.answers[index]?.value : null;
    const experience =
      typeof answer === 'string' || typeof answer === 'number'
        ? String(answer)
        : null;
    return {
      firstName: user.firstName,
      sport: selection?.sportLabel ?? null,
      experience,
      global: evaluation
        ? globalR(evaluation.areas, evaluation.overallConfidence, {
            min: evaluation.minScore,
            max: evaluation.maxScore,
          })
        : null,
    };
  }
}

@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey/profile')
@UseGuards(AuthenticatedGuard)
export class AthleteProfileController {
  constructor(private readonly profile: AthleteProfileService) {}

  @ApiOperation({
    summary: 'Profilo dell’atleta: sport, esperienza e sintesi globale di R',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get()
  view(@Req() req: { user: { id: string } }) {
    return this.profile.view(req.user.id);
  }
}

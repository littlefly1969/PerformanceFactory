import { Controller, Get, Header, Injectable, Req } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { PrismaService } from '../prisma/prisma.service';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import { requireSportContext } from '../onboarding/onboarding-sports';
import { performanceDriverName as driverName } from '../performance/performance-display';
import { loadAssessmentEvaluation } from './assessment-evaluation';

/**
 * Prima stima dello Spider, prima dell'assessment: senza evidenze sui driver
 * ogni driver parte da metà scala. È dichiaratamente una stima (tratteggio)
 * e viene sostituita dalla prima valutazione appena esiste.
 */
export const ESTIMATE_RATIO = 0.5;

@Injectable()
export class EstimatedProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async view(userId: string) {
    const { areas } = await requireSportContext(this.prisma, userId);
    const order = areas.map((a) => a.id);
    const evaluation = await loadAssessmentEvaluation(
      this.prisma,
      userId,
      order,
    );
    if (evaluation)
      return {
        estimated: false,
        scale: evaluation.scale,
        drivers: evaluation.drivers.map(({ id, name, score }) => ({
          id,
          name,
          score,
        })),
      };
    const scale = await loadScaleConfig(this.prisma);
    const score = Math.round(
      scale.minScore + (scale.maxScore - scale.minScore) * ESTIMATE_RATIO,
    );
    return {
      estimated: true,
      scale: { min: scale.minScore, max: scale.maxScore },
      drivers: areas.map((a) => ({
        id: a.id,
        name: driverName(a.name),
        score,
      })),
    };
  }
}

@ApiTags('athlete-journey')
@ApiCookieAuth()
@Controller('athlete-journey/estimate')
@UseGuards(AuthenticatedGuard)
export class EstimatedProfileController {
  constructor(private readonly profile: EstimatedProfileService) {}

  @ApiOperation({
    summary:
      'Spider iniziale: ultima valutazione o stima prima dell’assessment',
  })
  @Header('Cache-Control', 'private, no-store')
  @Get()
  view(@Req() req: { user: { id: string } }) {
    return this.profile.view(req.user.id);
  }
}

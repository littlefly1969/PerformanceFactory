import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@Controller('onboarding')
@UseGuards(AuthenticatedGuard)
@ApiCookieAuth()
@ApiBearerAuth()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('questionnaire')
  @ApiOperation({ summary: 'Get starter questionnaire for athlete onboarding' })
  getQuestionnaire(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.onboarding.getQuestionnaire({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'Get athlete onboarding status' })
  getStatus(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.onboarding.getStatus({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit starter questionnaire and generate baseline profile' })
  submit(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body()
    body: {
      goalText?: string;
      answers?: Array<{ questionId: string; value: string | number | boolean | null }>;
    },
  ) {
    return this.onboarding.submit(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body.goalText ?? '',
      body.answers ?? [],
    );
  }
}

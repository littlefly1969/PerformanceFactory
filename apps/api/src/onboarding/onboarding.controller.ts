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
  @ApiOperation({ summary: 'Ottieni questionario iniziale per onboarding atleta' })
  getQuestionnaire(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.onboarding.getQuestionnaire({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Get('status')
  @ApiOperation({ summary: 'Ottieni stato onboarding atleta' })
  getStatus(@Req() req: { user?: { id: string; role: UserRole } }) {
    return this.onboarding.getStatus({
      id: req.user?.id ?? '',
      role: req.user?.role ?? UserRole.USER,
    });
  }

  @Post('goal/validate')
  @ApiOperation({ summary: 'Valida obiettivo performance atleta prima dell invio onboarding' })
  validateGoal(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body() body: { goalText?: string },
  ) {
    return this.onboarding.validateGoal(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body.goalText ?? '',
    );
  }

  @Post('sport-selection')
  @ApiOperation({ summary: 'Salva sport e contesto scelti prima dell obiettivo' })
  saveSportSelection(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body()
    body: {
      sportId?: string;
      specializationId?: string;
    },
  ) {
    return this.onboarding.saveSportSelection(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body,
    );
  }

  @Post('goal/refine')
  @ApiOperation({ summary: 'Raffina obiettivo performance con chat AI' })
  refineGoal(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body()
    body: {
      originalGoal?: string;
      currentDraft?: string;
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      userReply?: string;
    },
  ) {
    return this.onboarding.refineGoal(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body,
    );
  }

  @Post('specialist-questions/generate')
  @ApiOperation({
    summary:
      'Genera e salva domande specialistiche personalizzate per area dopo anamnesi generale',
  })
  generateSpecialistQuestions(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body()
    body: {
      goalText?: string;
      answers?: Array<{
        questionId: string;
        value: string | number | boolean | null;
      }>;
    },
  ) {
    return this.onboarding.generateSpecialistQuestions(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body.goalText ?? '',
      body.answers ?? [],
    );
  }

  @Post('goal/final-validate')
  @ApiOperation({
    summary: 'Valida obiettivo finale con anamnesi e risposte specialistiche',
  })
  validateFinalGoal(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body()
    body: {
      goalText?: string;
      answers?: Array<{ questionId: string; value: string | number | boolean | null }>;
    },
  ) {
    return this.onboarding.validateFinalGoal(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body.goalText ?? '',
      body.answers ?? [],
    );
  }

  @Post('submit')
  @ApiOperation({ summary: 'Invia questionario iniziale e genera profilo baseline' })
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

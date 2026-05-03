import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { AnswersService } from './answers.service';

@ApiTags('answers')
@Controller('answers')
export class AnswersController {
  constructor(private readonly answers: AnswersService) {}

  @Post('batch')
  @ApiOperation({ summary: 'Invia un gruppo di risposte' })
  @ApiBody({ type: SubmitAnswersDto })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  submitBatch(
    @Req() req: { user?: { id: string; role: UserRole } },
    @Body() body: SubmitAnswersDto,
  ) {
    return this.answers.submitBatch(
      { id: req.user?.id ?? '', role: req.user?.role ?? UserRole.USER },
      body,
    );
  }
}

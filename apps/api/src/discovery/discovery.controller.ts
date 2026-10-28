import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DiscoveryService } from './discovery.service';
import { QuizDraftService } from './quiz-draft.service';
import { SaveQuizDraftDto } from './dto/quiz-draft.dto';

/** Token della bozza: header dedicato, mai in URL o nei log di accesso. */
const TOKEN_HEADER = 'x-quiz-token';

@ApiTags('discovery')
@Controller('public')
export class DiscoveryController {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly drafts: QuizDraftService,
  ) {}

  @Get('athlete-discovery')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Configurazione pubblica della discovery atleta' })
  configuration() {
    return this.discovery.configuration();
  }

  @Post('quiz-drafts')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Avvia una bozza anonima del quiz con la configurazione corrente congelata',
  })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 10, ttl: 60 * 1000 } })
  createDraft() {
    return this.drafts.create();
  }

  @Get('quiz-draft')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Riprende la bozza del quiz entro 7 giorni' })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 60, ttl: 60 * 1000 } })
  readDraft(@Headers(TOKEN_HEADER) token?: string) {
    return this.drafts.read(token);
  }

  @Put('quiz-draft')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: TOKEN_HEADER, required: true })
  @ApiOperation({
    summary: 'Salva il progresso del quiz e proroga la bozza di 7 giorni',
  })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 120, ttl: 60 * 1000 } })
  saveDraft(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body() body: SaveQuizDraftDto,
  ) {
    return this.drafts.save(token, body.draft);
  }

  @Delete('quiz-draft')
  @HttpCode(204)
  @ApiHeader({ name: TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Cancella la bozza del quiz per ricominciare' })
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ 'register-athlete': true })
  @Throttle({ 'public-events': { limit: 20, ttl: 60 * 1000 } })
  async removeDraft(@Headers(TOKEN_HEADER) token?: string) {
    await this.drafts.remove(token);
  }
}

import {
  BadRequestException,
  Controller,
  Get,
  Body,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentsService } from './consents.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

const AI_CONSENT_TYPE = 'AI_ASSISTANT';

@ApiTags('consents')
@Controller('consents')
export class ConsentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consents: ConsentsService,
  ) {}

  @Get('required')
  @ApiOperation({ summary: 'Stato consensi obbligatori' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  required(@Req() req: { user?: { id: string } }) {
    const userId = req.user?.id ?? '';
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    return this.consents.status(userId);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Documenti consenso correnti per registrazione' })
  documents() {
    return this.consents.requiredDocuments();
  }

  @Post('required')
  @ApiOperation({ summary: 'Accetta privacy e assistente AI obbligatori' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard)
  acceptRequired(
    @Req()
    req: {
      user?: { id: string };
      ip?: string;
      headers?: { 'user-agent'?: string };
    },
    @Body()
    body: {
      privacyAccepted?: boolean;
      aiAssistantAccepted?: boolean;
      acceptedDocuments?: Array<{
        type?: string;
        version?: string;
        documentHash?: string;
      }>;
    },
  ) {
    const userId = req.user?.id ?? '';
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }
    return this.consents.acceptRequired(userId, body, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
      source: 'reconsent',
    });
  }

  @Post('ai')
  @ApiOperation({ summary: 'Concedi consenso AI' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  async grantAiConsent(@Req() req: { user?: { id: string } }) {
    const userId = req.user?.id ?? '';
    if (!userId) {
      throw new BadRequestException('Utente mancante');
    }

    const existing = await this.prisma.consent.findFirst({
      where: { userId, type: AI_CONSENT_TYPE },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.consent.create({
        data: { userId, type: AI_CONSENT_TYPE },
      });
    }

    return { ok: true, aiConsent: true };
  }
}

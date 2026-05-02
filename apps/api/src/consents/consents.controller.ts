import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedGuard } from '../common/guards/authenticated.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

const AI_CONSENT_TYPE = 'AI';

@ApiTags('consents')
@Controller('consents')
export class ConsentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('ai')
  @ApiOperation({ summary: 'Grant AI consent' })
  @ApiCookieAuth()
  @UseGuards(AuthenticatedGuard, RolesGuard)
  @Roles(UserRole.USER)
  async grantAiConsent(@Req() req: { user?: { id: string } }) {
    const userId = req.user?.id ?? '';
    if (!userId) {
      throw new BadRequestException('Missing user');
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

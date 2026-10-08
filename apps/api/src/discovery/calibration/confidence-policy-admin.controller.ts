import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuthenticatedGuard } from '../../common/guards/authenticated.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PolicyKind,
  listPolicyVersions,
  publishPolicy,
} from './confidence-policy';
import {
  ConfidencePolicyKindParam,
  PublishConfidencePolicyDto,
} from './dto/calibration.dto';

/**
 * Back office: regole di confidence versionate per la lezione gratuita e per
 * il consolidamento di R (PF-FS-PREPAYWALL §7.1, OP-02, OP-03).
 */
@ApiTags('admin-calibration')
@ApiCookieAuth()
@Controller('admin/confidence-policies')
@UseGuards(AuthenticatedGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ConfidencePolicyAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Regole in vigore e storico delle versioni' })
  list() {
    return listPolicyVersions(this.prisma);
  }

  @Post(':kind')
  @ApiOperation({ summary: 'Pubblica una nuova versione della regola' })
  publish(
    @Req() req: { user: { id: string } },
    @Param() { kind }: ConfidencePolicyKindParam,
    @Body() body: PublishConfidencePolicyDto,
  ) {
    return publishPolicy(
      this.prisma,
      kind as PolicyKind,
      {
        minOverallConfidence: body.minOverallConfidence ?? null,
        minAreaConfidence: body.minAreaConfidence ?? null,
        minAreasAtConfidence: body.minAreasAtConfidence ?? null,
      },
      body.note?.trim() || null,
      req.user.id,
    );
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class SaveQuizDraftDto {
  /** Progresso del quiz; il servizio lo valida sulla versione congelata. */
  @ApiProperty({ type: Object })
  @IsObject()
  draft!: Record<string, unknown>;
}

import { ApiProperty } from '@nestjs/swagger';

export class RunCycleDto {
  @ApiProperty({ type: [String] })
  userIds: string[];

  @ApiProperty({ required: false })
  areaId?: string;

  @ApiProperty({ required: false })
  runAllAreas?: boolean;
}

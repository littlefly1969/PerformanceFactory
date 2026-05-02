import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterAthleteDto {
  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiPropertyOptional()
  aiConsent?: boolean;
}

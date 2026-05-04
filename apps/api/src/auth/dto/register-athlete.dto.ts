import { ApiProperty } from '@nestjs/swagger';

export class RegisterAthleteDto {
  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  password: string;

  @ApiProperty()
  privacyAccepted: boolean;

  @ApiProperty()
  aiAssistantAccepted: boolean;
}

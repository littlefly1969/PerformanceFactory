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

  @ApiProperty({ required: false })
  acceptedDocuments?: Array<{
    type?: string;
    version?: string;
    documentHash?: string;
  }>;
}

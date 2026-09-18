import { IsObject } from 'class-validator';
import { ConsentAcceptanceDto } from '../../consents/dto/consent-acceptance.dto';
export class GoogleRegistrationDto extends ConsentAcceptanceDto {
  @IsObject() discovery!: Record<string, unknown>;
}

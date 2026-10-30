import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

/** Risposta WebAuthn del browser: la verifica crittografica la fa il server. */
export class PasskeyRegistrationDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;
}

export class PasskeyLoginDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;
}

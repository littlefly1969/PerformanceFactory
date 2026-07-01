import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'Richiesta non valida' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be an email'],
      },
    ],
  })
  message: string | string[];

  @ApiPropertyOptional({ example: 'Bad Request' })
  error?: string;

  @ApiPropertyOptional({
    description:
      'Codice applicativo stabile, presente solo per errori di dominio.',
    example: 'REQUIRED_CONSENTS_MISSING',
  })
  code?: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['PRIVACY', 'AI_ASSISTANT'],
  })
  missingConsents?: string[];
}

export class HealthResponseDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status: 'ok';
}

export class AccessTokenResponseDto {
  @ApiProperty({
    description: 'Token bearer HMAC a breve durata.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({ description: 'Durata del token in secondi.', example: 1800 })
  expiresIn: number;
}

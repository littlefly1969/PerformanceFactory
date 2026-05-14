import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AcceptedDocumentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  version?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  documentHash?: string;
}

export class RegisterAthleteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(320)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @ApiProperty()
  @IsBoolean()
  privacyAccepted: boolean;

  @ApiProperty()
  @IsBoolean()
  aiAssistantAccepted: boolean;

  @ApiProperty({ required: false, type: [AcceptedDocumentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptedDocumentDto)
  acceptedDocuments?: AcceptedDocumentDto[];
}

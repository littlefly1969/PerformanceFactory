import { Injectable } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geo/geocoding.service';

const PROVINCE = /^[A-Za-z]{2}$/;
const POSTAL_CODE = /^\d{5}$/;

export class AthleteAddressDto {
  @ApiProperty({ description: 'Via e numero civico' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  street!: string;

  @ApiProperty({ description: 'CAP di cinque cifre' })
  @IsString()
  @Matches(POSTAL_CODE, { message: 'Il CAP usa cinque cifre' })
  postalCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ description: 'Sigla della provincia, due lettere' })
  @IsString()
  @Matches(PROVINCE, {
    message: 'La provincia usa due lettere (es. AQ, CH, PE, TE)',
  })
  @Length(2, 2)
  province!: string;
}

/**
 * Indirizzo dell'atleta, scritto e cancellato da lui dal profilo. Serve a una
 * cosa sola: dire quanto dista un circolo che offre la lezione gratuita. Il
 * geocoding e un tentativo: se non risponde l'indirizzo resta salvato senza
 * coordinate e la distanza si dichiara non calcolabile.
 */
@Injectable()
export class AthleteAddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  async get(userId: string) {
    const address = await this.prisma.userAddress.findUnique({
      where: { userId },
      select: {
        street: true,
        postalCode: true,
        city: true,
        province: true,
        latitude: true,
        longitude: true,
      },
    });
    if (!address) return { address: null, located: false };
    const { latitude, longitude, ...rest } = address;
    return {
      address: rest,
      located: latitude !== null && longitude !== null,
    };
  }

  async save(userId: string, input: AthleteAddressDto) {
    const address = {
      street: input.street.trim(),
      postalCode: input.postalCode.trim(),
      city: input.city.trim(),
      province: input.province.trim().toUpperCase(),
    };
    const located = await this.geocoding.locate(address);
    const coordinates = {
      latitude: located?.latitude ?? null,
      longitude: located?.longitude ?? null,
      geocodedAt: located ? new Date() : null,
    };
    await this.prisma.userAddress.upsert({
      where: { userId },
      create: { userId, ...address, ...coordinates },
      update: { ...address, ...coordinates },
    });
    return this.get(userId);
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { AddressSource } from '@prisma/client';
import {
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from '../geo/geocoding.service';
import { PlacesService } from '../geo/places.service';
import { readSelection, signSelection } from './address-selection';

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

/** Token della sessione di ricerca: lo genera il browser, uno per ricerca. */
const SESSION_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export class AddressSuggestionsDto {
  @ApiProperty({ description: 'Testo scritto finora, almeno 3 caratteri' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  input!: string;

  @ApiProperty({ description: 'Token della sessione di ricerca' })
  @Matches(SESSION_TOKEN)
  sessionToken!: string;
}

export class AddressResolveDto {
  @ApiProperty({ description: 'Place ID del suggerimento scelto' })
  @IsString()
  @MaxLength(300)
  @Matches(/^[A-Za-z0-9_-]+$/)
  placeId!: string;

  @ApiProperty({ description: 'Lo stesso token usato per i suggerimenti' })
  @Matches(SESSION_TOKEN)
  sessionToken!: string;
}

export class AddressSelectionDto {
  @ApiProperty({ description: 'Scelta firmata restituita da resolve' })
  @IsString()
  @MaxLength(4000)
  selection!: string;
}

/** Google chiede di non tenere le coordinate oltre 30 giorni senza rinnovarle. */
export const PROVIDER_LOCATION_MAX_AGE_DAYS = 30;
/** Si rinnovano qualche giorno prima, così un errore del provider non le perde. */
const PROVIDER_LOCATION_REFRESH_DAYS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Indirizzo dell'atleta, scritto e cambiato da lui dall'account. Serve a una
 * cosa sola: dire quanto dista un circolo che offre la lezione gratuita.
 * Con Google Places attivo si salva solo un indirizzo scelto fra i
 * suggerimenti e risolto dal backend; senza, si scrive a mano e il geocoding
 * e un tentativo: se non risponde l'indirizzo resta salvato senza coordinate
 * e la distanza si dichiara non calcolabile.
 */
@Injectable()
export class AthleteAddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly places: PlacesService,
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
        source: true,
        verifiedAt: true,
      },
    });
    const assisted = this.places.configured;
    if (!address)
      return { address: null, located: false, verified: false, assisted };
    const { latitude, longitude, source, verifiedAt, ...rest } = address;
    return {
      address: rest,
      located: latitude !== null && longitude !== null,
      verified: source === AddressSource.GOOGLE_PLACES && !!verifiedAt,
      assisted,
    };
  }

  /** Suggerimenti per il testo scritto, nella sessione di ricerca del browser. */
  async suggestions(input: AddressSuggestionsDto) {
    return {
      suggestions: await this.places.suggest(
        input.input.trim(),
        input.sessionToken,
      ),
    };
  }

  /**
   * Risolve il suggerimento scelto. Se l'indirizzo è completo restituisce
   * anche la scelta firmata da salvare; altrimenti dice cosa manca.
   */
  async resolve(userId: string, input: AddressResolveDto) {
    const result = await this.places.resolve(input.placeId, input.sessionToken);
    if (!result.complete) return result;
    const { place } = result;
    return {
      complete: true as const,
      address: {
        street: place.street,
        postalCode: place.postalCode,
        city: place.city,
        province: place.province,
      },
      formattedAddress: place.formattedAddress,
      selection: signSelection(userId, place),
    };
  }

  /** Salva l'indirizzo scelto: valgono solo i dati firmati dal backend. */
  async saveSelection(userId: string, input: AddressSelectionDto) {
    const place = readSelection(userId, input.selection);
    if (!place)
      throw new BadRequestException(
        'La scelta è scaduta o non è valida: cerca di nuovo l’indirizzo.',
      );
    const now = new Date();
    const data = {
      street: place.street,
      postalCode: place.postalCode,
      city: place.city,
      province: place.province,
      latitude: place.latitude,
      longitude: place.longitude,
      geocodedAt: now,
      source: AddressSource.GOOGLE_PLACES,
      placeId: place.placeId,
      verifiedAt: now,
    };
    await this.prisma.userAddress.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.get(userId);
  }

  /**
   * Rinnova le coordinate arrivate da Google prima dei 30 giorni; se il
   * rinnovo non riesce e il limite è passato le toglie, lasciando l'indirizzo.
   */
  async refreshProviderLocations(now = new Date(), batch = 100) {
    if (!this.places.configured) return { refreshed: 0, cleared: 0 };
    const rows = await this.prisma.userAddress.findMany({
      where: {
        source: AddressSource.GOOGLE_PLACES,
        placeId: { not: null },
        geocodedAt: {
          lt: new Date(now.getTime() - PROVIDER_LOCATION_REFRESH_DAYS * DAY_MS),
        },
      },
      select: { userId: true, placeId: true, geocodedAt: true },
      orderBy: { geocodedAt: 'asc' },
      take: batch,
    });
    let refreshed = 0;
    let cleared = 0;
    const limit = now.getTime() - PROVIDER_LOCATION_MAX_AGE_DAYS * DAY_MS;
    for (const row of rows) {
      const location = await this.places.locate(row.placeId!);
      if (location) {
        await this.prisma.userAddress.update({
          where: { userId: row.userId },
          data: { ...location, geocodedAt: now },
        });
        refreshed++;
      } else if (row.geocodedAt && row.geocodedAt.getTime() < limit) {
        await this.prisma.userAddress.update({
          where: { userId: row.userId },
          data: { latitude: null, longitude: null, geocodedAt: null },
        });
        cleared++;
      }
    }
    return { refreshed, cleared };
  }

  /** Indirizzo scritto a mano: solo finché Google Places non è attivo. */
  async save(userId: string, input: AthleteAddressDto) {
    if (this.places.configured)
      throw new ConflictException(
        'Scegli il tuo indirizzo fra i suggerimenti.',
      );
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
    const manual = {
      source: AddressSource.MANUAL,
      placeId: null,
      verifiedAt: null,
    };
    await this.prisma.userAddress.upsert({
      where: { userId },
      create: { userId, ...address, ...coordinates, ...manual },
      update: { ...address, ...coordinates, ...manual },
    });
    return this.get(userId);
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { isAnonymousId } from '../analytics/analytics-events';
import {
  AttributionInput,
  DIRECT_TOUCH,
  attributedCodes,
  sanitizeTouch,
} from './attribution';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto';
import { ClubImageKind, clubImagePath, decodeClubImage } from './club-image';
import { GeocodingService } from '../geo/geocoding.service';

const REFERRAL_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const REFERRAL_LENGTH = 8;

const partnerSelect = {
  id: true,
  kind: true,
  code: true,
  name: true,
  city: true,
  province: true,
  address: true,
  postalCode: true,
  website: true,
  latitude: true,
  longitude: true,
  isActive: true,
  freeLessonsEnabled: true,
  logoUpdatedAt: true,
  photoUpdatedAt: true,
  createdAt: true,
} as const;

type PartnerRow = Prisma.PartnerGetPayload<{ select: typeof partnerSelect }>;

/**
 * Il back office vede i percorsi delle immagini, non i data URL, e se la sede
 * e stata riconosciuta: senza coordinate la distanza dall'atleta non si calcola.
 */
function partnerView({
  logoUpdatedAt,
  photoUpdatedAt,
  latitude,
  longitude,
  ...partner
}: PartnerRow) {
  return {
    ...partner,
    located: latitude !== null && longitude !== null,
    logoUrl: clubImagePath(partner.id, 'logo', logoUpdatedAt),
    photoUrl: clubImagePath(partner.id, 'photo', photoUpdatedAt),
  };
}

/** Campo di testo opzionale: senza contenuto resta null invece di stringa vuota. */
const text = (value: string | undefined) => value?.trim() || null;

type Sede = {
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
};

/** Un'immagine nuova aggiorna la sua versione; null la rimuove. */
function imageUpdate(kind: ClubImageKind, value: string | null | undefined) {
  if (value === undefined) return {};
  return {
    [`${kind}Image`]: value,
    [`${kind}UpdatedAt`]: value === null ? null : new Date(),
  };
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  /**
   * Coordinate della sede, risolte dall'indirizzo quando ci sono tutte le
   * parti. Un tentativo, non un obbligo: senza risposta restano nulle e
   * all'atleta si dice che la distanza non si puo calcolare.
   */
  private async locate({ address, postalCode, city, province }: Sede) {
    const located =
      address && postalCode && city && province
        ? await this.geocoding.locate({
            street: address,
            postalCode,
            city,
            province,
          })
        : null;
    return {
      latitude: located?.latitude ?? null,
      longitude: located?.longitude ?? null,
      geocodedAt: located ? new Date() : null,
    };
  }

  async list() {
    const [partners, counts] = await Promise.all([
      this.prisma.partner.findMany({
        select: partnerSelect,
        orderBy: { name: 'asc' },
      }),
      this.prisma.userAttribution.groupBy({
        by: ['partnerId'],
        where: { partnerId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const byPartner = new Map(
      counts.map((row) => [row.partnerId, row._count._all]),
    );
    return partners.map((partner) => ({
      ...partnerView(partner),
      attributedUsers: byPartner.get(partner.id) ?? 0,
    }));
  }

  async create(input: CreatePartnerDto) {
    const sede: Sede = {
      address: text(input.address),
      postalCode: text(input.postalCode),
      city: text(input.city),
      province: text(input.province)?.toUpperCase() ?? null,
    };
    try {
      const partner = await this.prisma.partner.create({
        data: {
          code: input.code,
          name: input.name.trim(),
          ...sede,
          website: text(input.website),
          ...(await this.locate(sede)),
          ...(input.freeLessonsEnabled !== undefined && {
            freeLessonsEnabled: input.freeLessonsEnabled,
          }),
        },
        select: partnerSelect,
      });
      return partnerView(partner);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Codice circolo gia in uso');
      throw error;
    }
  }

  async update(id: string, input: UpdatePartnerDto) {
    const existing = await this.prisma.partner.findUnique({
      where: { id },
      select: {
        id: true,
        address: true,
        postalCode: true,
        city: true,
        province: true,
      },
    });
    if (!existing) throw new NotFoundException('Circolo non trovato');
    const changes: Partial<Sede> = {
      ...(input.address !== undefined && { address: text(input.address) }),
      ...(input.postalCode !== undefined && {
        postalCode: text(input.postalCode),
      }),
      ...(input.city !== undefined && { city: text(input.city) }),
      ...(input.province !== undefined && {
        province: text(input.province)?.toUpperCase() ?? null,
      }),
    };
    // Le coordinate si rifanno solo quando la sede cambia davvero.
    const sede: Sede = { ...existing, ...changes };
    const moved = (Object.keys(changes) as Array<keyof Sede>).some(
      (field) => sede[field] !== existing[field],
    );
    const partner = await this.prisma.partner.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...changes,
        ...(input.website !== undefined && { website: text(input.website) }),
        ...(moved ? await this.locate(sede) : {}),
        ...(input.freeLessonsEnabled !== undefined && {
          freeLessonsEnabled: input.freeLessonsEnabled,
        }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
        ...imageUpdate('logo', input.logoImage),
        ...imageUpdate('photo', input.photoImage),
      },
      select: partnerSelect,
    });
    return partnerView(partner);
  }

  /** Logo o foto di un circolo attivo, già decodificati per la risposta HTTP. */
  async image(id: string, kind: ClubImageKind) {
    const partner = await this.prisma.partner.findFirst({
      where: { id, isActive: true },
      select: { logoImage: true, photoImage: true },
    });
    const dataUrl = kind === 'logo' ? partner?.logoImage : partner?.photoImage;
    const image = dataUrl ? decodeClubImage(dataUrl) : null;
    if (!image) throw new NotFoundException('Immagine non trovata');
    return image;
  }

  /**
   * Salva la provenienza nella stessa transazione che crea l'utente. Codici di
   * circolo inattivi o sconosciuti restano nelle tracce ma non attribuiscono.
   */
  async recordAttribution(
    tx: Prisma.TransactionClient,
    userId: string,
    input: AttributionInput | undefined,
  ) {
    const now = new Date();
    const first = sanitizeTouch(input?.firstTouch, now) ?? DIRECT_TOUCH;
    const last = sanitizeTouch(input?.lastTouch, now) ?? first;
    const codes = attributedCodes(first, last);
    const [partner, referrer] = await Promise.all([
      codes.club
        ? tx.partner.findFirst({
            where: { code: codes.club, isActive: true },
            select: { id: true, code: true },
          })
        : null,
      codes.ref
        ? tx.user.findFirst({
            where: { referralCode: codes.ref, NOT: { id: userId } },
            select: { id: true },
          })
        : null,
    ]);
    const anonymousId = isAnonymousId(input?.anonymousId)
      ? input.anonymousId.toLowerCase()
      : null;
    await tx.userAttribution.create({
      data: {
        userId,
        anonymousId,
        firstTouch: first,
        lastTouch: last,
        partnerId: partner?.id ?? null,
        referrerId: referrer?.id ?? null,
      },
    });
    return {
      anonymousId,
      source: first.source ?? null,
      campaign: first.campaign ?? null,
      club: partner?.code ?? null,
      referred: !!referrer,
    };
  }

  /** Codice referral creato alla prima richiesta, con nuovo tentativo su collisione. */
  async referralCode(userId: string) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (!user) throw new NotFoundException('Utente non trovato');
      if (user.referralCode) return user.referralCode;
      const code = Array.from(
        { length: REFERRAL_LENGTH },
        () => REFERRAL_ALPHABET[randomInt(REFERRAL_ALPHABET.length)],
      ).join('');
      try {
        // updateMany con referralCode null: una richiesta concorrente non sovrascrive.
        await this.prisma.user.updateMany({
          where: { id: userId, referralCode: null },
          data: { referralCode: code },
        });
      } catch (error) {
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )
        )
          throw error;
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (user?.referralCode) return user.referralCode;
    throw new ConflictException('Codice referral non disponibile, riprova');
  }

  async referral(userId: string) {
    const code = await this.referralCode(userId);
    const origin = (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:3000').split(
      ',',
    )[0];
    const invited = await this.prisma.userAttribution.count({
      where: { referrerId: userId },
    });
    return { code, link: `${origin}/start?ref=${code}`, invited };
  }
}

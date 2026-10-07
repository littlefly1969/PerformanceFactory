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

const REFERRAL_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const REFERRAL_LENGTH = 8;

const partnerSelect = {
  id: true,
  kind: true,
  code: true,
  name: true,
  city: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

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
      ...partner,
      attributedUsers: byPartner.get(partner.id) ?? 0,
    }));
  }

  async create(input: CreatePartnerDto) {
    try {
      return await this.prisma.partner.create({
        data: {
          code: input.code,
          name: input.name.trim(),
          city: input.city?.trim() || null,
        },
        select: partnerSelect,
      });
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
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Circolo non trovato');
    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.city !== undefined && { city: input.city.trim() || null }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
      select: partnerSelect,
    });
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

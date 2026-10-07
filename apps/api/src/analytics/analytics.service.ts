import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AnalyticsEventName,
  EventProperties,
  allowedProperties,
  assertAnonymousId,
  clientEventName,
  eventTime,
} from './analytics-events';
import { TrackEventsDto } from './dto/track-events.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Eventi anonimi del browser: mai collegati a un utente da qui. Ogni evento
   * ha un eventId, quindi un reinvio (rete instabile, doppio click) non
   * gonfia il funnel.
   */
  async trackClient(input: TrackEventsDto) {
    const anonymousId = assertAnonymousId(input.anonymousId);
    const now = new Date();
    const data = input.events.map((event) => {
      const name = clientEventName(event.name);
      return {
        name,
        eventId: assertAnonymousId(event.eventId),
        occurredAt: eventTime(event.occurredAt, now),
        anonymousId,
        origin: 'CLIENT',
        properties: allowedProperties(name, event.properties),
      };
    });
    const saved = await this.prisma.analyticsEvent.createMany({
      data,
      skipDuplicates: true,
    });
    return { accepted: saved.count };
  }

  /** Evento emesso dal server, anche dentro una transazione di dominio. */
  trackServer(
    name: AnalyticsEventName,
    input: {
      userId: string;
      anonymousId?: string | null;
      properties?: EventProperties;
    },
    db: Db = this.prisma,
  ) {
    return db.analyticsEvent.create({
      data: {
        name,
        occurredAt: new Date(),
        userId: input.userId,
        anonymousId: input.anonymousId ?? null,
        origin: 'SERVER',
        properties: input.properties ?? {},
      },
    });
  }

  /**
   * Conteggi per evento nel periodo e per circolo di provenienza: prima base
   * del reporting settimanale finche A10 non fissa formule e dashboard.
   */
  async funnel(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [events, registrationsByPartner] = await Promise.all([
      // Persone distinte per evento: chi torna indietro e riparte non gonfia il funnel.
      this.prisma.$queryRaw<Array<{ name: string; people: bigint }>>`
        SELECT "name", COUNT(DISTINCT COALESCE("userId", "anonymousId"))::bigint AS people
        FROM "AnalyticsEvent"
        WHERE "occurredAt" >= ${since}
        GROUP BY "name"`,
      this.prisma.$queryRaw<
        Array<{ partner: string | null; registrations: bigint }>
      >`
        SELECT p."name" AS partner, COUNT(*)::bigint AS registrations
        FROM "UserAttribution" a
        LEFT JOIN "Partner" p ON p."id" = a."partnerId"
        WHERE a."createdAt" >= ${since}
        GROUP BY p."name"
        ORDER BY registrations DESC`,
    ]);
    return {
      since: since.toISOString(),
      days,
      events: Object.fromEntries(
        events.map((row) => [row.name, Number(row.people)]),
      ),
      registrationsByPartner: registrationsByPartner.map((row) => ({
        partner: row.partner,
        registrations: Number(row.registrations),
      })),
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_FLAG_REGISTRY,
  FeatureFlagKey,
  FeatureFlagState,
  isFeatureEnabled,
} from './feature-flags';

const flagSelect = {
  key: true,
  description: true,
  enabled: true,
  betaTesters: true,
  rolloutPercent: true,
  updatedAt: true,
  updatedById: true,
} as const;

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stato di tutti i flag conosciuti dal codice; quelli mai salvati sono spenti. */
  async list() {
    const rows = await this.prisma.featureFlag.findMany({
      where: { key: { in: FEATURE_FLAG_REGISTRY.map((flag) => flag.key) } },
      select: flagSelect,
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FEATURE_FLAG_REGISTRY.map(
      (flag) =>
        byKey.get(flag.key) ?? {
          key: flag.key,
          description: flag.description,
          enabled: false,
          betaTesters: true,
          rolloutPercent: 0,
          updatedAt: null,
          updatedById: null,
        },
    );
  }

  /** Flag attivi per l'utente, come mappa chiave → booleano. */
  async forUser(userId: string | null) {
    const [flags, user] = await Promise.all([
      this.list(),
      userId
        ? this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, isBetaTester: true },
          })
        : null,
    ]);
    const audience = user
      ? { userId: user.id, isBetaTester: user.isBetaTester }
      : null;
    return Object.fromEntries(
      flags.map((flag) => [flag.key, isFeatureEnabled(flag, audience)]),
    ) as Record<FeatureFlagKey, boolean>;
  }

  async isEnabled(key: FeatureFlagKey, userId: string | null) {
    return (await this.forUser(userId))[key] === true;
  }

  async update(
    key: string,
    input: Partial<Omit<FeatureFlagState, 'key'>>,
    actorId: string,
  ) {
    const known = FEATURE_FLAG_REGISTRY.find((flag) => flag.key === key);
    if (!known) throw new NotFoundException('Feature flag sconosciuto');
    return this.prisma.$transaction(async (tx) => {
      // Lock della riga: due modifiche simultanee non perdono l'audit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`feature-flag:${key}`}))`;
      const before = await tx.featureFlag.findUnique({
        where: { key },
        select: flagSelect,
      });
      const data = {
        description: known.description,
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        ...(input.betaTesters !== undefined && {
          betaTesters: input.betaTesters,
        }),
        ...(input.rolloutPercent !== undefined && {
          rolloutPercent: input.rolloutPercent,
        }),
        updatedById: actorId,
      };
      const after = await tx.featureFlag.upsert({
        where: { key },
        create: { key, ...data },
        update: data,
        select: flagSelect,
      });
      await tx.featureFlagChange.create({
        data: {
          flagKey: key,
          actorId,
          before: before
            ? (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
          after: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue,
        },
      });
      return after;
    });
  }

  betaTesters() {
    return this.prisma.user.findMany({
      where: { isBetaTester: true },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: { email: 'asc' },
    });
  }

  async setBetaTester(email: string, isBetaTester: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Utente non trovato');
    return this.prisma.user.update({
      where: { id: user.id },
      data: { isBetaTester },
      select: { id: true, email: true, isBetaTester: true },
    });
  }
}

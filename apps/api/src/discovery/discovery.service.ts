import { assertDiscoveryGraph } from './discovery-conditions';
import { assertDiscoveryMetadata } from './discovery-metadata';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoveryOption, DiscoveryQuestion } from './discovery.types';

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async configuration(
    db: Pick<
      Prisma.TransactionClient,
      'onboardingQuestionTemplate' | 'sport'
    > = this.prisma,
  ) {
    const mode =
      process.env.PF4_SPORT_MODE === 'user_choice' ? 'user_choice' : 'fixed';
    const [templates, sports] = await Promise.all([
      db.onboardingQuestionTemplate.findMany({
        where: { scope: 'DISCOVERY', isActive: true },
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
      }),
      db.sport.findMany({
        where: {
          isActive: true,
          specializations: { some: { isActive: true } },
        },
        orderBy: [{ label: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          key: true,
          label: true,
          specializations: {
            where: { isActive: true },
            orderBy: [{ label: 'asc' }, { id: 'asc' }],
            select: { id: true, key: true, label: true },
          },
        },
      }),
    ]);
    try {
      assertDiscoveryGraph(templates);
    } catch {
      throw new ServiceUnavailableException('Percorsi discovery non validi');
    }
    const questions: DiscoveryQuestion[] = templates.map((t) => {
      try {
        assertDiscoveryMetadata(t.optionsJson, t.required);
      } catch {
        throw new ServiceUnavailableException(
          'Configurazione discovery non valida',
        );
      }
      const metadata = (t.optionsJson ??
        {}) as unknown as Partial<DiscoveryQuestion>;
      let options: DiscoveryOption[] = (metadata.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description,
        value: o.value,
      }));
      if (metadata.target === 'sportId')
        options = sports.map((s) => ({
          id: s.id,
          label: s.label,
          value: s.id,
        }));
      if (metadata.target === 'specializationId')
        options = sports.flatMap((s) =>
          s.specializations.map((p) => ({
            id: p.id,
            label: p.label,
            value: p.id,
            parentId: s.id,
          })),
        );
      return {
        id: t.id,
        code: t.key,
        title: t.label,
        description: t.helpText ?? undefined,
        type:
          metadata.type ??
          (t.inputType === 'NUMBER'
            ? 'number'
            : t.inputType === 'SCORE'
              ? 'scale'
              : 'single_choice'),
        required: t.required,
        order: t.orderIndex,
        options,
        target: metadata.target,
        dependsOn:
          metadata.target === 'specializationId' ? 'sportId' : undefined,
        visibleWhen: metadata.visibleWhen,
        contextKey: metadata.contextKey,
        min: metadata.min,
        max: metadata.max,
        step: metadata.step,
        ui: metadata.ui
          ? {
              presentation: metadata.ui.presentation,
              columns: metadata.ui.columns,
              unit: metadata.ui.unit,
            }
          : undefined,
      };
    });
    if (
      !sports.length ||
      !(
        mode === 'fixed'
          ? ['goalId']
          : ['sportId', 'specializationId', 'goalId']
      ).every(
        (target) => questions.filter((q) => q.target === target).length === 1,
      )
    ) {
      throw new ServiceUnavailableException('Discovery non configurata');
    }
    if (
      mode === 'user_choice' &&
      questions.findIndex((q) => q.target === 'sportId') >
        questions.findIndex((q) => q.target === 'specializationId')
    ) {
      throw new ServiceUnavailableException(
        'Lo sport deve precedere la specializzazione',
      );
    }
    const sport = sports.find(
      (s) =>
        s.key.toUpperCase() ===
        (process.env.PF4_SPORT_KEY ?? 'PADEL').toUpperCase(),
    );
    const specialization = sport?.specializations.find(
      (s) =>
        s.key.toUpperCase() ===
        (process.env.PF4_SPECIALIZATION_KEY ?? 'STANDARD').toUpperCase(),
    );
    if (mode === 'fixed' && (!sport || !specialization))
      throw new ServiceUnavailableException(
        'Configura lo sport Padel e la specializzazione Standard attivi',
      );
    const sportContext =
      mode === 'fixed' && sport && specialization
        ? {
            mode: 'fixed' as const,
            sport: { id: sport.id, key: sport.key, label: sport.label },
            specialization,
          }
        : { mode: 'user_choice' as const };
    const visibleQuestions =
      mode === 'fixed'
        ? questions.filter(
            (q) => q.target !== 'sportId' && q.target !== 'specializationId',
          )
        : questions;
    const version = parseInt(
      createHash('sha256')
        .update(JSON.stringify({ sportContext, questions: visibleQuestions }))
        .digest('hex')
        .slice(0, 12),
      16,
    );
    return { version, sports, sportContext, questions: visibleQuestions };
  }
}

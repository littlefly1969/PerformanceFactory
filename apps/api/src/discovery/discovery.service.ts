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
          label: true,
          specializations: {
            where: { isActive: true },
            orderBy: [{ label: 'asc' }, { id: 'asc' }],
            select: { id: true, label: true },
          },
        },
      }),
    ]);
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
      !['sportId', 'specializationId', 'goalId'].every(
        (target) => questions.filter((q) => q.target === target).length === 1,
      )
    ) {
      throw new ServiceUnavailableException('Discovery non configurata');
    }
    if (
      questions.findIndex((q) => q.target === 'sportId') >
      questions.findIndex((q) => q.target === 'specializationId')
    ) {
      throw new ServiceUnavailableException(
        'Lo sport deve precedere la specializzazione',
      );
    }
    const version = parseInt(
      createHash('sha256')
        .update(JSON.stringify(questions))
        .digest('hex')
        .slice(0, 12),
      16,
    );
    return { version, sports, questions };
  }
}

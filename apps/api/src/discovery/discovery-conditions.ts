import { BadRequestException } from '@nestjs/common';
import { DiscoveryCondition } from './discovery.types';

export function assertDiscoveryCondition(
  value: unknown,
): asserts value is DiscoveryCondition {
  const fail = (): never => {
    throw new BadRequestException('Condizione discovery non valida');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail();
  const condition = value as Record<string, unknown>;
  if (
    !['all', 'any'].includes(String(condition.match)) ||
    !Array.isArray(condition.rules) ||
    !condition.rules.length ||
    condition.rules.length > 20
  )
    return fail();
  for (const rule of condition.rules as unknown[]) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return fail();
    const r = rule as Record<string, unknown>;
    if (
      typeof r.question !== 'string' ||
      !r.question ||
      r.question.length > 100 ||
      !['in', 'not_in'].includes(String(r.operator)) ||
      !Array.isArray(r.values) ||
      !r.values.length ||
      r.values.length > 100 ||
      r.values.some(
        (v: unknown) =>
          !['string', 'number', 'boolean'].includes(typeof v) ||
          (typeof v === 'number' && !Number.isFinite(v)) ||
          (typeof v === 'string' && v.length > 100),
      )
    )
      return fail();
  }
}

type BranchTemplate = {
  id?: string;
  key: string;
  orderIndex: number;
  isActive: boolean;
  optionsJson: unknown;
};
/** Restrict references to earlier questions: no cycles, missing parents or ambiguous ordering. */
export function assertDiscoveryGraph(templates: BranchTemplate[]) {
  const earlier = new Map<string, BranchTemplate>();
  for (const template of templates
    .filter((t) => t.isActive)
    .sort((a, b) => a.orderIndex - b.orderIndex)) {
    const metadata = template.optionsJson as {
      visibleWhen?: unknown;
      target?: string;
    } | null;
    if (metadata?.visibleWhen !== undefined) {
      assertDiscoveryCondition(metadata.visibleWhen);
      if (metadata.target)
        throw new BadRequestException(
          'Le domande sport e obiettivo devono essere sempre visibili',
        );
      for (const rule of metadata.visibleWhen.rules) {
        const parent = earlier.get(rule.question);
        if (!parent || parent.orderIndex >= template.orderIndex)
          throw new BadRequestException(
            `La domanda ${template.key} deve dipendere da una domanda attiva precedente: ${rule.question}`,
          );
        const p = parent.optionsJson as {
          type?: string;
          target?: string;
          options?: { id: string }[];
        };
        if (p.target === 'sportId' || p.target === 'specializationId')
          throw new BadRequestException(
            'Usa una domanda del percorso come condizione, non il contesto sport fisso',
          );
        if (
          (p.type === 'single_choice' || p.type === 'multi_choice') &&
          rule.values.some((v) => !p.options?.some((o) => o.id === v))
        )
          throw new BadRequestException(
            `Opzione non valida nella condizione di ${template.key}`,
          );
        if (
          p.type === 'boolean' &&
          rule.values.some((v) => typeof v !== 'boolean')
        )
          throw new BadRequestException(
            'Le condizioni sì/no richiedono valori booleani',
          );
        if (
          (p.type === 'number' || p.type === 'scale') &&
          rule.values.some((v) => typeof v !== 'number')
        )
          throw new BadRequestException(
            'Le condizioni numeriche richiedono numeri',
          );
        if (
          p.type === 'date' &&
          rule.values.some(
            (v) => typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v),
          )
        )
          throw new BadRequestException(
            'Le condizioni data richiedono date ISO',
          );
      }
    }
    earlier.set(template.key, template);
  }
}

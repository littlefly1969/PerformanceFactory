import { OnboardingInputType, OnboardingQuestionScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  TemplateRecord,
  OnboardingAnswer,
} from '../onboarding/onboarding-model';
import { DiscoveryConfiguration, DiscoveryDraft } from './discovery.types';

/** Use the immutable configuration accepted at registration, including disabled/edited questions. */
export async function discoveryContext(prisma: PrismaService, userId: string) {
  const saved = await prisma.athleteDiscovery?.findUnique({
    where: { userId },
  });
  if (!saved) return null;
  const config = saved.configuration as unknown as DiscoveryConfiguration;
  const draft = saved.draft as unknown as DiscoveryDraft;
  const templates: TemplateRecord[] = [];
  const answers: OnboardingAnswer[] = [];
  for (const q of config.questions) {
    const raw = q.target ? draft[q.target] : draft.answers[q.id];
    const value = Array.isArray(raw)
      ? raw
          .map((v) => q.options.find((o) => o.id === v)?.label ?? String(v))
          .join(', ')
      : (q.options.find((o) => o.id === raw)?.value ?? raw ?? null);
    templates.push({
      id: q.id,
      key: q.contextKey ?? q.code,
      scope: OnboardingQuestionScope.GENERAL,
      areaId: null,
      area: null,
      label: q.title,
      helpText: q.description ?? null,
      inputType:
        typeof value === 'number'
          ? OnboardingInputType.NUMBER
          : OnboardingInputType.TEXT,
      optionsJson: null,
      required: q.required,
      orderIndex: q.order,
    });
    answers.push({
      questionId: q.id,
      value: value as OnboardingAnswer['value'],
    });
  }
  return { templates, answers };
}

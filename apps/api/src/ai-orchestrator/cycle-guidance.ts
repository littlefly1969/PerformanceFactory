import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { athleteDate, dateOnly } from '../athlete/training-sessions';
import { AreaRecord } from './orchestrator-model';
import {
  CycleProposal,
  TrainingCycleProposal,
} from './proposal-provider.service';

export async function loadAreaGenerationConfig(
  prisma: PrismaService,
  areaId: string,
) {
  return prisma.aiAreaGenerationConfig.findUnique({
    where: { areaId },
    select: {
      initialContext: true,
      responseFormatPrompt: true,
      questionnaireLayoutJson: true,
      version: true,
      activePromptVersionId: true,
    },
  });
}

export async function loadSportSpecializationPromptInstruction(
  prisma: PrismaService,
  userId: string,
  areaId: string,
) {
  const selection = await prisma.userSportSelection.findUnique({
    where: { userId },
    select: { specializationId: true },
  });
  if (!selection) {
    return null;
  }
  return prisma.sportSpecializationAreaPrompt
    .findUnique({
      where: {
        specializationId_areaId: {
          specializationId: selection.specializationId,
          areaId,
        },
      },
      select: {
        basePrompt: true,
        version: true,
        activePromptVersionId: true,
        updatedAt: true,
        isActive: true,
        isEnabledDriver: true,
        area: { select: { name: true } },
        specialization: {
          select: {
            label: true,
            sport: { select: { label: true } },
          },
        },
      },
    })
    .then((prompt) =>
      prompt?.isActive && prompt.isEnabledDriver ? prompt : null,
    );
}

export async function loadTrainingPromptInstruction(
  prisma: PrismaService,
  userId: string,
) {
  const selection = await prisma.userSportSelection.findUnique({
    where: { userId },
    select: { specializationId: true },
  });
  if (!selection) {
    return null;
  }
  return prisma.sportSpecialization
    .findUnique({
      where: { id: selection.specializationId },
      select: {
        id: true,
        label: true,
        trainingPrompt: true,
        trainingPromptVersion: true,
        activeTrainingPromptVersionId: true,
        trainingPromptActive: true,
        updatedAt: true,
        sport: { select: { label: true } },
      },
    })
    .then((specialization) =>
      specialization?.trainingPromptActive && specialization.trainingPrompt
        ? {
            ...specialization,
            trainingPrompt: specialization.trainingPrompt,
          }
        : null,
    );
}

export function buildPlanItems(
  area: AreaRecord,
  proposal: CycleProposal,
): Prisma.PlanItemUncheckedCreateWithoutPlanReleaseInput[] {
  return proposal.planItems.map((item) => ({
    areaId: area.id,
    type: item.type,
    title: item.title,
    body: item.body,
    metadata: (item.metadata ?? {
      source: 'orchestrator',
      area: area.name,
      provider: proposal.provider,
      model: proposal.model,
      promptVersion: proposal.promptVersion,
    }) as Prisma.InputJsonObject,
    status: 'PROPOSED',
  }));
}

export function buildQuestions(
  area: AreaRecord,
  proposal: CycleProposal,
): Prisma.QuestionUncheckedCreateWithoutQuestionSetInput[] {
  return proposal.questions.map((question, index) => ({
    areaId: area.id,
    text: question.text,
    objectiveRef: question.objectiveRef ?? `area:${area.id}`,
    orderIndex: question.orderIndex ?? index + 1,
    options: {
      create: question.options.map((option) => ({ ...option })),
    },
  }));
}

export function buildTrainingPlanItems(
  proposal: TrainingCycleProposal,
): Prisma.TrainingPlanItemUncheckedCreateWithoutTrainingPlanReleaseInput[] {
  return proposal.planItems.map((item, index) => ({
    orderIndex: index,
    type: item.type,
    title: item.title,
    body: item.body,
    metadata: {
      source: 'training-orchestrator',
      provider: proposal.provider,
      model: proposal.model,
      promptVersion: proposal.promptVersion,
      durationMinutes: item.durationMinutes,
      equipment: item.equipment ?? null,
      sets: item.sets ?? null,
      reps: item.reps ?? null,
      restSeconds: item.restSeconds ?? null,
      schedule: { dayOffset: item.dayOffset },
    },
    status: 'PROPOSED',
  }));
}

export function buildTrainingQuestions(
  proposal: CycleProposal,
): Prisma.TrainingQuestionUncheckedCreateWithoutQuestionSetInput[] {
  return proposal.questions.map((question, index) => ({
    text: question.text,
    objectiveRef: question.objectiveRef ?? 'training',
    orderIndex: question.orderIndex ?? index + 1,
    options: {
      create: question.options.map((option) => ({ ...option })),
    },
  }));
}

export async function buildApprovals(
  tx: Prisma.TransactionClient,
  userId: string,
  area: AreaRecord,
) {
  const link = await tx.professionalUserLink.findFirst({
    where: { userId, areaId: area.id },
    select: { professionalId: true },
  });

  if (!link) {
    throw new BadRequestException(
      `Nessun professionista collegato all'utente per l'area ${area.name}`,
    );
  }

  return [
    {
      areaId: area.id,
      professionalId: link.professionalId,
      status: 'PENDING',
    },
  ];
}

export async function loadTrainingCoachContext(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const selection = await tx.userSportSelection.findUnique({
    where: { userId },
    select: {
      specializationId: true,
      specialization: {
        select: {
          label: true,
          sport: { select: { label: true } },
        },
      },
    },
  });

  if (!selection) {
    throw new BadRequestException(
      'Seleziona sport e specializzazione prima di generare l allenamento',
    );
  }

  const link = await tx.coachUserLink.findUnique({
    where: {
      userId_specializationId: {
        userId,
        specializationId: selection.specializationId,
      },
    },
    select: { coachId: true },
  });

  if (!link) {
    throw new BadRequestException(
      `Nessun allenatore collegato all'utente per ${selection.specialization.sport.label} - ${selection.specialization.label}`,
    );
  }

  return {
    specializationId: selection.specializationId,
    coachId: link.coachId,
  };
}

export async function assertPreviousCycleCompleted(
  client: Pick<PrismaService, 'improvementPlanRelease'>,
  userId: string,
  areaId: string,
) {
  const active = await client.improvementPlanRelease.findFirst({
    where: { userId, areaId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      startsOn: true,
      endsOn: true,
      items: { select: { status: true } },
      questionSets: {
        select: { status: true, closedAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!active) {
    return;
  }

  // Un'area a calendario segue la finestra: blocca finche la finestra corre,
  // poi lascia spazio alla successiva senza pretendere il recupero degli arretrati.
  if (active.startsOn) {
    if (active.endsOn && dateOnly(athleteDate()) < active.endsOn)
      throw new BadRequestException(
        'La finestra dell area precedente e ancora in corso',
      );
    return;
  }

  const allActivitiesCompleted =
    active.items.length > 0 &&
    active.items.every((item) => item.status === 'COMPLETED');
  if (!allActivitiesCompleted) {
    throw new BadRequestException(
      'L attivita dell allenamento precedente deve essere completata prima di generare un nuovo ciclo',
    );
  }

  const questionnaire = active.questionSets[0];
  if (!questionnaire || questionnaire.status !== 'CLOSED') {
    throw new BadRequestException(
      'Il questionario precedente deve essere completato prima di generare un nuovo ciclo',
    );
  }
}

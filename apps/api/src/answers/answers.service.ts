import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { terminalTrainingStates } from '../athlete/training-sessions';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { OrchestratorService } from '../ai-orchestrator/orchestrator.service';

type Actor = {
  id: string;
  role: UserRole;
};

@Injectable()
export class AnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async submitBatch(actor: Actor, input: SubmitAnswersDto) {
    if (!actor?.id) {
      throw new BadRequestException('Attore mancante');
    }

    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException(
        'Solo gli utenti atleta possono inviare risposte',
      );
    }

    if (!input.questionSetId || !input.answers?.length) {
      throw new BadRequestException('Risposte mancanti');
    }

    const questionSet = await this.prisma.questionSet.findUnique({
      where: { id: input.questionSetId },
      select: {
        id: true,
        userId: true,
        status: true,
        questions: {
          select: {
            id: true,
            options: { select: { id: true, score: true } },
          },
        },
      },
    });

    if (!questionSet) {
      throw new NotFoundException('Questionario non trovato');
    }

    if (questionSet.userId !== actor.id) {
      throw new ForbiddenException('Non puoi rispondere a questo questionario');
    }

    if (questionSet.status !== 'PUBLISHED') {
      throw new BadRequestException('Il questionario non e pubblicato');
    }

    const questionMap = new Map(
      questionSet.questions.map((question) => [question.id, question]),
    );
    const seenQuestions = new Set<string>();
    const questionIds = input.answers.map((answer) => answer.questionId);

    for (const answer of input.answers) {
      if (!answer.questionId || !answer.answerOptionId) {
        throw new BadRequestException('Dati risposta mancanti');
      }
      if (seenQuestions.has(answer.questionId)) {
        throw new BadRequestException('Domanda duplicata nei dati inviati');
      }
      seenQuestions.add(answer.questionId);
      if (!questionMap.has(answer.questionId)) {
        throw new BadRequestException(
          'Domanda non valida per questo questionario',
        );
      }
    }

    if (seenQuestions.size !== questionSet.questions.length) {
      throw new BadRequestException('Devi rispondere a tutte le domande');
    }

    const existing = await this.prisma.userAnswer.findMany({
      where: { userId: actor.id, questionId: { in: questionIds } },
      select: { questionId: true },
    });

    if (existing.length > 0) {
      throw new BadRequestException('Risposte gia inviate');
    }

    const data = input.answers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      const option = question?.options.find(
        (item) => item.id === answer.answerOptionId,
      );
      if (!option) {
        throw new BadRequestException('Opzione risposta non valida');
      }
      return {
        userId: actor.id,
        questionId: answer.questionId,
        answerOptionId: answer.answerOptionId,
        scoreAwarded: option.score,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.userAnswer.createMany({ data });
      const snapshot =
        await this.orchestrator.createSnapshotFromQuestionSetInTransaction(
          tx,
          input.questionSetId,
          'Questionario inviato',
        );

      return {
        count: result.count,
        questionSetId: input.questionSetId,
        status: 'CLOSED',
        snapshotId: snapshot.snapshotId,
      };
    });
  }

  async submitTrainingBatch(actor: Actor, input: SubmitAnswersDto) {
    if (!actor?.id) {
      throw new BadRequestException('Attore mancante');
    }

    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException(
        'Solo gli utenti atleta possono inviare risposte',
      );
    }

    if (!input.questionSetId || !input.answers?.length) {
      throw new BadRequestException('Risposte mancanti');
    }

    const questionSet = await this.prisma.trainingQuestionSet.findUnique({
      where: { id: input.questionSetId },
      select: {
        id: true,
        userId: true,
        status: true,
        trainingPlanReleaseId: true,
        trainingPlanRelease: {
          select: { status: true, items: { select: { status: true } } },
        },
        questions: {
          select: {
            id: true,
            options: { select: { id: true, score: true } },
          },
        },
      },
    });

    if (!questionSet) {
      throw new NotFoundException('Questionario allenamento non trovato');
    }
    if (questionSet.userId !== actor.id) {
      throw new ForbiddenException('Non puoi rispondere a questo questionario');
    }
    if (questionSet.status !== 'PUBLISHED') {
      throw new BadRequestException('Il questionario non e pubblicato');
    }

    if (
      questionSet.trainingPlanRelease.status !== 'ACTIVE' ||
      !questionSet.trainingPlanRelease.items.length ||
      questionSet.trainingPlanRelease.items.some(
        (i) => !terminalTrainingStates.includes(i.status),
      )
    )
      throw new BadRequestException(
        'Completa o salta le sessioni prima del check-in',
      );

    const questionMap = new Map(
      questionSet.questions.map((question) => [question.id, question]),
    );
    const seenQuestions = new Set<string>();
    const questionIds = input.answers.map((answer) => answer.questionId);

    for (const answer of input.answers) {
      if (!answer.questionId || !answer.answerOptionId) {
        throw new BadRequestException('Dati risposta mancanti');
      }
      if (seenQuestions.has(answer.questionId)) {
        throw new BadRequestException('Domanda duplicata nei dati inviati');
      }
      seenQuestions.add(answer.questionId);
      if (!questionMap.has(answer.questionId)) {
        throw new BadRequestException(
          'Domanda non valida per questo questionario',
        );
      }
    }

    if (seenQuestions.size !== questionSet.questions.length) {
      throw new BadRequestException('Devi rispondere a tutte le domande');
    }

    const existing = await this.prisma.trainingUserAnswer.findMany({
      where: { userId: actor.id, trainingQuestionId: { in: questionIds } },
      select: { trainingQuestionId: true },
    });

    if (existing.length > 0) {
      throw new BadRequestException('Risposte gia inviate');
    }

    const data = input.answers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      const option = question?.options.find(
        (item) => item.id === answer.answerOptionId,
      );
      if (!option) {
        throw new BadRequestException('Opzione risposta non valida');
      }
      return {
        userId: actor.id,
        trainingQuestionId: answer.questionId,
        trainingAnswerOptionId: answer.answerOptionId,
        scoreAwarded: option.score,
      };
    });

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.trainingQuestionSet.updateMany({
        where: {
          id: input.questionSetId,
          userId: actor.id,
          status: 'PUBLISHED',
          trainingPlanRelease: {
            status: 'ACTIVE',
            items: {
              some: {},
              every: { status: { in: terminalTrainingStates } },
            },
          },
        },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new BadRequestException(
          'Check-in già inviato o non più disponibile',
        );
      const result = await tx.trainingUserAnswer.createMany({ data });

      return {
        count: result.count,
        questionSetId: input.questionSetId,
        trainingPlanReleaseId: questionSet.trainingPlanReleaseId,
        status: 'CLOSED',
      };
    });
  }
}

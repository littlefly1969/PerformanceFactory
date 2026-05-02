import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      throw new BadRequestException('Missing actor');
    }

    if (actor.role !== UserRole.USER) {
      throw new ForbiddenException('Only users can submit answers');
    }

    if (!input.questionSetId || !input.answers?.length) {
      throw new BadRequestException('Missing answers');
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
      throw new NotFoundException('Question set not found');
    }

    if (questionSet.userId !== actor.id) {
      throw new ForbiddenException('Not allowed to answer this set');
    }

    if (questionSet.status !== 'PUBLISHED') {
      throw new BadRequestException('Question set is not published');
    }

    const questionMap = new Map(
      questionSet.questions.map((question) => [question.id, question]),
    );
    const seenQuestions = new Set<string>();
    const questionIds = input.answers.map((answer) => answer.questionId);

    for (const answer of input.answers) {
      if (!answer.questionId || !answer.answerOptionId) {
        throw new BadRequestException('Missing answer fields');
      }
      if (seenQuestions.has(answer.questionId)) {
        throw new BadRequestException('Duplicate question in payload');
      }
      seenQuestions.add(answer.questionId);
      if (!questionMap.has(answer.questionId)) {
        throw new BadRequestException('Invalid question for this set');
      }
    }

    if (seenQuestions.size !== questionSet.questions.length) {
      throw new BadRequestException('All questions must be answered');
    }

    const existing = await this.prisma.userAnswer.findMany({
      where: { userId: actor.id, questionId: { in: questionIds } },
      select: { questionId: true },
    });

    if (existing.length > 0) {
      throw new BadRequestException('Answers already submitted');
    }

    const data = input.answers.map((answer) => {
      const question = questionMap.get(answer.questionId);
      const option = question?.options.find(
        (item) => item.id === answer.answerOptionId,
      );
      if (!option) {
        throw new BadRequestException('Invalid answer option');
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
          'Questionnaire submitted',
        );

      return {
        count: result.count,
        questionSetId: input.questionSetId,
        status: 'CLOSED',
        snapshotId: snapshot.snapshotId,
      };
    });
  }
}

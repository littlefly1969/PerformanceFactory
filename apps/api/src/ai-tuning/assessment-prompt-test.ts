import { BadRequestException } from '@nestjs/common';
import { AiProposalProviderService } from '../ai-orchestrator/proposal-provider.service';
import { AssessmentEvaluationInput } from '../ai-orchestrator/assessment-evaluation-model';
import { PrismaService } from '../prisma/prisma.service';

/** Prova una bozza sull'input dell'ultima valutazione salvata, senza salvare nulla. */
export async function testAssessmentPrompt(
  prisma: PrismaService,
  ai: AiProposalProviderService,
  basePrompt: string,
) {
  const latest = await prisma.assessmentEvaluation.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, inputJson: true, outputJson: true },
  });
  const user = (
    latest?.inputJson as {
      prompt?: { user?: Partial<AssessmentEvaluationInput> };
    }
  )?.prompt?.user;
  if (!latest || !user?.drivers?.length || !user.scale)
    throw new BadRequestException(
      'Serve almeno una valutazione salvata da usare come caso di prova.',
    );
  const result = await ai.evaluateAssessment({
    basePrompt,
    promptVersionId: null,
    scale: user.scale,
    athleteContext: user.athleteContext ?? [],
    availability: user.availability ?? [],
    drivers: user.drivers,
  });
  return {
    caseEvaluationId: latest.id,
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    output: {
      ...result.output,
      drivers: result.output.drivers.map((d) => ({
        ...d,
        name: user.drivers!.find((x) => x.areaId === d.areaId)?.name,
      })),
    },
    previousOutput: latest.outputJson,
  };
}

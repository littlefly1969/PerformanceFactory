import { EstimatedProfileService } from './estimated-profile';
import { requireSportContext } from '../onboarding/onboarding-sports';
import { loadAssessmentEvaluation } from './assessment-evaluation';
import { loadScaleConfig } from '../ai-orchestrator/performance-scoring';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('../onboarding/onboarding-sports', () => ({
  requireSportContext: jest.fn(),
}));
jest.mock('./assessment-evaluation', () => ({
  loadAssessmentEvaluation: jest.fn(),
}));
jest.mock('../ai-orchestrator/performance-scoring', () => ({
  loadScaleConfig: jest.fn(),
}));

const areas = [
  { id: 'a1', name: 'Tecnica' },
  { id: 'a2', name: 'Tattica' },
  { id: 'a3', name: 'Fisico' },
];
const service = new EstimatedProfileService({} as PrismaService);

beforeEach(() => {
  jest.mocked(requireSportContext).mockResolvedValue({
    areas,
  } as never);
  jest.mocked(loadScaleConfig).mockResolvedValue({
    minScore: 0,
    maxScore: 10,
  } as never);
});

describe('EstimatedProfileService', () => {
  it('before any evaluation every driver starts at half scale, as an estimate', async () => {
    jest.mocked(loadAssessmentEvaluation).mockResolvedValue(null);
    const view = await service.view('u1');
    expect(view.estimated).toBe(true);
    expect(view.scale).toEqual({ min: 0, max: 10 });
    expect(view.drivers.map((d) => [d.id, d.score])).toEqual([
      ['a1', 5],
      ['a2', 5],
      ['a3', 5],
    ]);
  });

  it('with an evaluation returns its scores in driver order, not estimated', async () => {
    jest.mocked(loadAssessmentEvaluation).mockResolvedValue({
      scale: { min: 0, max: 100 },
      drivers: [
        { id: 'a1', name: 'Tecnica', score: 62, confidence: 0.4 },
        { id: 'a2', name: 'Tattica', score: 48, confidence: 0.3 },
      ],
    } as never);
    const view = await service.view('u1');
    expect(loadAssessmentEvaluation).toHaveBeenCalledWith({}, 'u1', [
      'a1',
      'a2',
      'a3',
    ]);
    expect(view).toEqual({
      estimated: false,
      scale: { min: 0, max: 100 },
      drivers: [
        { id: 'a1', name: 'Tecnica', score: 62 },
        { id: 'a2', name: 'Tattica', score: 48 },
      ],
    });
  });
});

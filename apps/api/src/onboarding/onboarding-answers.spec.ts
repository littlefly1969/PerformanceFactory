import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  OnboardingInputType,
  OnboardingQuestionScope,
  UserRole,
} from '@prisma/client';
import {
  assertAthlete,
  buildGeneralProfile,
  normalizeAnswersForQuestions,
  scoreAnswer,
  serializeAnswer,
} from './onboarding-answers';
import { TemplateRecord } from './onboarding-model';

const template: TemplateRecord = {
  id: 'question',
  key: 'sleep',
  scope: OnboardingQuestionScope.GENERAL,
  areaId: null,
  label: 'Sleep',
  helpText: null,
  inputType: OnboardingInputType.SCORE,
  optionsJson: [],
  required: true,
  orderIndex: 0,
  area: null,
};

describe('onboarding answers', () => {
  it('requires an authenticated athlete', () => {
    expect(() => assertAthlete({ id: '', role: UserRole.USER })).toThrow(
      BadRequestException,
    );
    expect(() => assertAthlete({ id: 'admin', role: UserRole.ADMIN })).toThrow(
      ForbiddenException,
    );
    expect(() =>
      assertAthlete({ id: 'athlete', role: UserRole.USER }),
    ).not.toThrow();
  });

  it('rejects missing required answers and preserves optional answers as null', () => {
    expect(() => normalizeAnswersForQuestions([template], [])).toThrow(
      'Risposta mancante',
    );
    expect(
      normalizeAnswersForQuestions([{ ...template, required: false }], [])[0],
    ).toMatchObject({ value: null, score: null });
  });

  it.each([1, 2, 3, 4, 5])(
    'converts specialist score %i onto the 100-point scale',
    (score) => {
      expect(
        scoreAnswer(
          { ...template, scope: OnboardingQuestionScope.AREA },
          score,
        ),
      ).toBe(score * 20);
    },
  );

  it('supports numeric strings, configured options and clamps option scores', () => {
    expect(scoreAnswer(template, '80')).toBe(80);
    expect(scoreAnswer(template, 33)).toBe(33);
    const select = {
      ...template,
      inputType: OnboardingInputType.SELECT,
      optionsJson: [
        { value: 'high', score: 120 },
        { value: 'low', score: -5 },
      ],
    };
    expect(scoreAnswer(select, 'high')).toBe(100);
    expect(scoreAnswer(select, 'low')).toBe(0);
    expect(scoreAnswer(select, 'unknown')).toBeNull();
    expect(
      scoreAnswer(
        { ...template, inputType: OnboardingInputType.TEXT },
        'notes',
      ),
    ).toBeNull();
  });

  it.each([-1, 101, 'invalid'])('rejects invalid score %s', (value) => {
    expect(() => scoreAnswer(template, value)).toThrow(BadRequestException);
  });

  it('keeps specialist answers out of the general profile and preserves serialized fields', () => {
    const answers = normalizeAnswersForQuestions(
      [
        template,
        {
          ...template,
          id: 'area-question',
          key: 'strength',
          scope: OnboardingQuestionScope.AREA,
          areaId: 'area',
        },
      ],
      [
        { questionId: 'question', value: 60 },
        { questionId: 'area-question', value: 4 },
      ],
    );
    expect(buildGeneralProfile(answers)).toEqual({
      sleep: { label: 'Sleep', value: 60 },
    });
    expect(serializeAnswer(answers[1])).toMatchObject({
      questionId: 'area-question',
      areaId: 'area',
      value: 4,
      score: 80,
    });
  });
});

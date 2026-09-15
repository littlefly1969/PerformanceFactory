import { BadRequestException } from '@nestjs/common';
import {
  parseGoalValidationJson,
  parseHistorySummaryJson,
  parseProposalJson,
  parseSpecialistOnboardingQuestionJson,
} from './proposal-json';
import { resolveConfiguredProvider } from './provider-config';

describe('AI response boundaries', () => {
  it.each([
    parseGoalValidationJson,
    parseHistorySummaryJson,
    parseProposalJson,
    parseSpecialistOnboardingQuestionJson,
  ])('rejects malformed external JSON (%#)', (parse) => {
    expect(() => parse('not json', 'Gemini')).toThrow(BadRequestException);
    expect(() => parse('not json', 'Gemini')).toThrow('Gemini');
    expect(parse('{"example":"value"}', 'OpenAI')).toEqual({
      example: 'value',
    });
  });

  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('requires an explicit provider in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveConfiguredProvider()).toThrow(
      'AI_PROVIDER e obbligatorio',
    );
  });
  it('uses deterministic stub in development only when unconfigured', () => {
    process.env.NODE_ENV = 'development';
    expect(resolveConfiguredProvider()).toBe('stub');
  });
  it.each(['openai', 'gemini', 'stub'])(
    'normalizes provider %s',
    (provider) => {
      expect(resolveConfiguredProvider(` ${provider.toUpperCase()} `)).toBe(
        provider,
      );
    },
  );
  it('rejects unknown providers', () => {
    expect(() => resolveConfiguredProvider('unknown')).toThrow(
      'AI_PROVIDER non supportato',
    );
  });
});

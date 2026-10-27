import { BadRequestException, Logger } from '@nestjs/common';
import {
  AiQuotaExhaustedException,
  aiFetch,
  isDailyQuotaError,
} from './ai-fetch';

const DAILY = JSON.stringify({
  error: {
    code: 429,
    message:
      'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, description: Generate content requests per day limit exceeded on Free Tier',
    details: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
  },
});
const PER_MINUTE = JSON.stringify({
  error: {
    code: 429,
    message: 'Generate content requests per minute limit exceeded',
  },
});

describe('aiFetch', () => {
  const fetchMock = jest.fn();
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });
  afterEach(() => fetchMock.mockReset());

  it('recognises the daily quota, not the per-minute limit', () => {
    expect(isDailyQuotaError(429, DAILY)).toBe(true);
    expect(isDailyQuotaError(429, PER_MINUTE)).toBe(false);
    expect(isDailyQuotaError(500, DAILY)).toBe(false);
  });

  it('stops at once with a readable error when the daily quota is exhausted', async () => {
    fetchMock.mockResolvedValue(new Response(DAILY, { status: 429 }));
    const call = aiFetch('https://ai.test', {}, { provider: 'gemini' });
    await expect(call).rejects.toBeInstanceOf(AiQuotaExhaustedException);
    await expect(call).rejects.toMatchObject({
      response: { code: 'AI_QUOTA_EXHAUSTED' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still retries the per-minute limit', async () => {
    fetchMock.mockResolvedValue(
      new Response(PER_MINUTE, {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
    );
    await expect(
      aiFetch('https://ai.test', {}, { provider: 'gemini', retries: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

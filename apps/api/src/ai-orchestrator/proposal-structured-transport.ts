import { BadRequestException, Logger } from '@nestjs/common';
import { aiFetch } from '../common/ai-fetch';
import { logDebugPrompt } from './proposal-audit';

/** Shared wire transport; AREA and TRAINING retain their own schemas and normalizers. */
export async function requestStructuredProposal(
  logger: Logger,
  provider: 'openai' | 'gemini',
  model: string,
  inputJson: Record<string, unknown>,
  prompt: { system: string; user: unknown; schema: unknown },
  schemaName: string,
) {
  const apiKey =
    provider === 'openai'
      ? process.env.OPENAI_API_KEY
      : process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new BadRequestException(
      `${provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} e obbligatoria per AI_PROVIDER=${provider}`,
    );
  logDebugPrompt(logger, provider, model, inputJson);
  if (provider === 'openai') {
    const response = await aiFetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: JSON.stringify(prompt.user) },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: schemaName,
              strict: true,
              schema: prompt.schema,
            },
          },
        }),
      },
      { provider },
    );
    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };
    const outputText =
      payload.output_text ??
      payload.output
        ?.flatMap((item) => item.content ?? [])
        .map((content) => content.text)
        .find((text): text is string => !!text);
    if (!outputText)
      throw new BadRequestException('La risposta proposta OpenAI e vuota');
    return {
      outputText,
      usage: {
        inputTokens: payload.usage?.input_tokens ?? null,
        outputTokens: payload.usage?.output_tokens ?? null,
        totalTokens: payload.usage?.total_tokens ?? null,
      },
    };
  }
  const modelName = model.startsWith('models/')
    ? model.slice('models/'.length)
    : model;
  const response = await aiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [
          { role: 'user', parts: [{ text: JSON.stringify(prompt.user) }] },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: prompt.schema,
        },
      }),
    },
    { provider },
  );
  const payload = (await response.json()) as {
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ text?: string }> };
    }>;
    promptFeedback?: { blockReason?: string };
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };
  const outputText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((text): text is string => !!text)
    .join('');
  if (!outputText)
    throw new BadRequestException(
      `La risposta proposta Gemini e vuota: ${payload.promptFeedback?.blockReason ?? payload.candidates?.[0]?.finishReason ?? 'risposta vuota'}`,
    );
  return {
    outputText,
    usage: {
      inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
    },
  };
}

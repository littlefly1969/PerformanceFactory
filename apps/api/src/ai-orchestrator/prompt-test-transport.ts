import { BadRequestException } from '@nestjs/common';
import { aiFetch } from '../common/ai-fetch';
import { AiProvider } from './proposal-provider-model';
import { resolveModel, resolveProvider } from './provider-config';
export async function testPrompt(input: {
  prompt: string;
  context?: string;
  provider?: AiProvider | 'configured';
}) {
  const prompt = input.prompt?.trim();
  if (!prompt || prompt.length < 10) {
    throw new BadRequestException('Prompt troppo corto per il test');
  }

  const provider =
    input.provider && input.provider !== 'configured'
      ? input.provider
      : resolveProvider();
  const model = resolveModel(provider);
  const startedAt = Date.now();
  const system =
    'Sei un tester di prompt per Performance Factory. Esegui il prompt ricevuto usando il contesto di prova, rispondi in italiano e segnala eventuali ambiguita operative senza inventare dati atleta.';
  const userPayload = {
    prompt,
    context:
      input.context?.trim() ||
      'Atleta test: obiettivo migliorare performance sportiva in modo misurabile, progressivo e revisionabile.',
  };
  const inputJson = {
    prompt: {
      system,
      user: userPayload,
    },
  };

  if (provider === 'stub') {
    return {
      provider,
      model,
      outputText: [
        'TEST STUB COMPLETATO.',
        `Il prompt contiene ${prompt.length} caratteri.`,
        `Contesto usato: ${userPayload.context}`,
        'Con un provider reale qui vedresti la risposta generata dall AI selezionata.',
      ].join('\n'),
      inputJson,
      latencyMs: Date.now() - startedAt,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    };
  }

  if (provider === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException(
        'OPENAI_API_KEY e obbligatoria per testare con OpenAI',
      );
    }
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
            { role: 'system', content: system },
            { role: 'user', content: JSON.stringify(userPayload) },
          ],
        }),
      },
      { provider: 'openai' },
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
    if (!outputText) {
      throw new BadRequestException('La risposta test OpenAI e vuota');
    }
    return {
      provider,
      model,
      outputText,
      inputJson,
      latencyMs: Date.now() - startedAt,
      inputTokens: payload.usage?.input_tokens ?? null,
      outputTokens: payload.usage?.output_tokens ?? null,
      totalTokens: payload.usage?.total_tokens ?? null,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException(
      'GEMINI_API_KEY e obbligatoria per testare con Gemini',
    );
  }
  const modelName = model.startsWith('models/')
    ? model.slice('models/'.length)
    : model;
  const response = await aiFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: JSON.stringify(userPayload) }],
          },
        ],
      }),
    },
    { provider: 'gemini' },
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
  if (!outputText) {
    const reason =
      payload.promptFeedback?.blockReason ??
      payload.candidates?.[0]?.finishReason ??
      'risposta vuota';
    throw new BadRequestException(`La risposta test Gemini e vuota: ${reason}`);
  }
  return {
    provider,
    model,
    outputText,
    inputJson,
    latencyMs: Date.now() - startedAt,
    inputTokens: payload.usageMetadata?.promptTokenCount ?? null,
    outputTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
    totalTokens: payload.usageMetadata?.totalTokenCount ?? null,
  };
}

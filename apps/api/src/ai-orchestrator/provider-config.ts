import { BadRequestException } from '@nestjs/common';
import { AiProvider } from './proposal-provider-model';

export function resolveProvider(): AiProvider {
  return resolveConfiguredProvider();
}

export function resolveConfiguredProvider(
  configuredProvider = process.env.AI_PROVIDER,
): AiProvider {
  const provider = configuredProvider?.trim().toLowerCase();
  if (!provider) {
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException('AI_PROVIDER e obbligatorio in produzione');
    }
    return 'stub';
  }
  if (provider === 'stub' || provider === 'openai' || provider === 'gemini') {
    return provider;
  }
  throw new BadRequestException(`AI_PROVIDER non supportato: ${provider}`);
}

export function resolveModel(provider: AiProvider) {
  if (provider === 'openai') {
    return process.env.AI_MODEL_PROPOSAL ?? 'gpt-5.4-mini';
  }
  if (provider === 'gemini') {
    return process.env.GEMINI_MODEL_PROPOSAL ?? 'gemini-2.5-flash';
  }
  return 'deterministic-stub';
}

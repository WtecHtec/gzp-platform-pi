/* eslint-disable import/prefer-default-export */
import type { Model } from '@earendil-works/pi-ai';
import type { LlmConfig } from './model-settings-store';

export function createPiModel(config: LlmConfig): Model<'openai-completions'> {
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: 'openai',
    baseUrl: config.baseUrl.replace(/\/+$/, ''),
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };
}

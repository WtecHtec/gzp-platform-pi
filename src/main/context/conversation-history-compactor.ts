import type { ChatMessage } from '../../shared/contracts';
import type { LlmConfig } from '../model-settings-store';
import type { ContextCompactionConfig } from './context-config';
import type { ContextSummarizer } from './context-summarizer';
import TokenEstimator from './token-estimator';

export interface ConversationCompactionResult {
  messages: ChatMessage[];
  compacted: boolean;
  estimatedTokens: number;
  summaryMessage?: ChatMessage;
}

export default class ConversationHistoryCompactor {
  constructor(
    private readonly estimator: TokenEstimator,
    private readonly summarizer: ContextSummarizer,
    private readonly config: Pick<
      ContextCompactionConfig,
      'compactionTokenThreshold' | 'keepRecentMessages'
    >,
  ) {}

  async compactIfNeeded(
    messages: ChatMessage[],
    llmConfig: LlmConfig,
  ): Promise<ConversationCompactionResult> {
    const estimatedTokens = this.estimator.estimate(messages);
    if (messages.length <= this.config.keepRecentMessages) {
      return { messages, compacted: false, estimatedTokens };
    }
    if (estimatedTokens < this.config.compactionTokenThreshold) {
      return { messages, compacted: false, estimatedTokens };
    }

    const cutIndex = messages.length - this.config.keepRecentMessages;
    const summary = await this.summarizer.summarize(
      messages.slice(0, cutIndex),
      llmConfig,
    );
    const summaryMessage: ChatMessage = {
      id: `context-summary-${Date.now()}`,
      role: 'user',
      kind: 'text',
      content: `[之前对话的压缩摘要]\n${summary}`,
      createdAt: new Date().toISOString(),
    };

    return {
      messages: [summaryMessage, ...messages.slice(cutIndex)],
      compacted: true,
      estimatedTokens,
      summaryMessage,
    };
  }
}

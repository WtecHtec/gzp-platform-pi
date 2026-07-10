import { completeSimple } from '@earendil-works/pi-ai';
import type { AssistantMessage, Message } from '@earendil-works/pi-ai';
import type { ChatMessage } from '../../shared/contracts';
import type { LlmConfig } from '../model-settings-store';
import { createPiModel } from '../pi-model';
import type { ContextCompactionConfig } from './context-config';

export interface ContextSummarizer {
  summarize(messages: ChatMessage[], config: LlmConfig): Promise<string>;
}

function textFromAssistantMessage(message: AssistantMessage): string {
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function textFromChatMessage(message: ChatMessage, limit: number): string {
  const toolText =
    message.toolSteps
      ?.map((step) => {
        const output = step.output || '';
        const clipped =
          output.length > limit ? `${output.slice(0, limit)}...(已截断)` : output;
        return `工具 ${step.name}: ${clipped}`;
      })
      .join('\n') || '';
  const body = [message.content, message.thinkingContent, toolText]
    .filter(Boolean)
    .join('\n');
  return body.length > limit ? `${body.slice(0, limit)}...(已截断)` : body;
}

function fallbackSummary(messages: ChatMessage[], limit: number): string {
  return messages
    .map((message) => {
      const text = textFromChatMessage(message, limit);
      return `${message.role}: ${text}`;
    })
    .join('\n\n')
    .slice(0, 6000);
}

export default class ModelContextSummarizer implements ContextSummarizer {
  constructor(
    private readonly config: Pick<
      ContextCompactionConfig,
      'summaryMessageCharLimit' | 'summaryMaxTokens'
    >,
  ) {}

  async summarize(messages: ChatMessage[], config: LlmConfig): Promise<string> {
    const transcript = messages
      .map((message) => {
        const text = textFromChatMessage(
          message,
          this.config.summaryMessageCharLimit,
        );
        return `${message.role}: ${text}`;
      })
      .join('\n\n');

    const requestMessages: Message[] = [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              '请把以下对话历史压缩成一段简明摘要。必须保留：关键事实、' +
              '已做出的决定、涉及的文件路径/代码位置、尚未完成的任务。' +
              '不要输出除摘要本身之外的任何内容。\n\n' +
              transcript,
          },
        ],
        timestamp: Date.now(),
      },
    ];

    try {
      const response = await completeSimple(
        createPiModel(config),
        { messages: requestMessages },
        {
          apiKey: config.apiKey,
          maxTokens: this.config.summaryMaxTokens,
        },
      );
      const summary = textFromAssistantMessage(response).trim();
      return (
        summary || fallbackSummary(messages, this.config.summaryMessageCharLimit)
      );
    } catch {
      return fallbackSummary(messages, this.config.summaryMessageCharLimit);
    }
  }
}

import {
  Agent,
  type AgentTool,
  type AgentMessage,
} from '@earendil-works/pi-agent-core';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import {
  AgentRunInput,
  AgentRunResult,
  ChatMessage,
} from '../shared/contracts';
import type { LlmConfig } from './model-settings-store';
import { createPiModel } from './pi-model';
import ApplicationLogger from '../domain/observability/application-logger';
import ConversationHistoryCompactor from './context/conversation-history-compactor';
import SessionProfileStore from './memory/session-profile-store';
import buildSystemPromptWithProfile from './memory/profile-prompt';

const baseSystemPrompt = `你是“公众号写作台”，只处理微信公众号文章创作。
你拥有三个基础工具：read, write, bash。未提供的工具视为不可用。
安全策略：bash 工具禁止执行任何危险或破坏性的系统操作（如删除文件、特权切换、重启系统等）。`;

function assistantText(message: AssistantMessage | undefined): string {
  if (!message) return '';
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function mapHistoryToAgentMessages(history: ChatMessage[]): AgentMessage[] {
  const messages: AgentMessage[] = [];
  history.forEach((msg) => {
    if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: [{ type: 'text', text: msg.content }],
      } as any);
    } else if (msg.role === 'assistant') {
      if (msg.toolSteps && msg.toolSteps.length > 0) {
        const toolCalls = msg.toolSteps.map((step) => ({
          type: 'toolCall' as const,
          id: step.id,
          name: step.name,
          arguments: step.args || {},
        }));
        messages.push({
          role: 'assistant',
          content: toolCalls,
        } as any);

        msg.toolSteps.forEach((step) => {
          messages.push({
            role: 'toolResult',
            toolCallId: step.id,
            toolName: step.name,
            content: [{ type: 'text', text: step.output || '' }],
            isError: step.isError,
            timestamp: Date.now(),
          } as any);
        });
      }

      if (msg.content) {
        messages.push({
          role: 'assistant',
          content: [{ type: 'text', text: msg.content }],
        } as any);
      }
    }
  });
  return messages;
}

export default class PiAgentRuntime {
  private readonly activeAgents = new Map<string, Agent>();

  private readonly toolFactory: (sessionId: string) => AgentTool[];

  private readonly skillPromptProvider: () => Promise<string>;

  private readonly historyCompactor: ConversationHistoryCompactor;

  private readonly profileStore: SessionProfileStore;

  private readonly logger: ApplicationLogger;

  constructor(
    toolFactory: (sessionId: string) => AgentTool[],
    skillPromptProvider: () => Promise<string>,
    historyCompactor: ConversationHistoryCompactor,
    profileStore: SessionProfileStore,
    logger: ApplicationLogger,
  ) {
    this.toolFactory = toolFactory;
    this.skillPromptProvider = skillPromptProvider;
    this.historyCompactor = historyCompactor;
    this.profileStore = profileStore;
    this.logger = logger;
  }

  async run(
    config: LlmConfig,
    input: AgentRunInput,
    signal: AbortSignal,
    onDelta: (delta: string) => void,
    onThinkingDelta: (delta: string) => void,
    onToolEvent?: (event: {
      type: 'tool-started' | 'tool-completed';
      toolName: string;
      toolCallId: string;
      isError?: boolean;
      toolOutput?: string;
      args?: any;
    }) => void,
  ): Promise<AgentRunResult> {
    const history = input.history
      ? await this.historyCompactor.compactIfNeeded(input.history, config)
      : undefined;
    if (history?.compacted) {
      this.logger.info('agent.context.compacted', {
        runId: input.runId,
        sessionId: input.sessionId,
        estimatedTokens: history.estimatedTokens,
      });
    }
    const initialMessages = history
      ? mapHistoryToAgentMessages(history.messages)
      : [];
    const profile = await this.profileStore.ensureProfile(input.sessionId);
    const skillPrompt = await this.skillPromptProvider();
    const systemPrompt = buildSystemPromptWithProfile(
      `${baseSystemPrompt}\n\n${skillPrompt}`,
      profile,
    );
    const agent = new Agent({
      initialState: {
        systemPrompt,
        model: createPiModel(config),
        thinkingLevel: 'minimal',
        tools: this.toolFactory(input.sessionId),
        messages: initialMessages,
      },
      sessionId: input.sessionId,
      getApiKey: () => config.apiKey,
    });
    this.activeAgents.set(input.sessionId, agent);

    let finalMessage: AssistantMessage | undefined;
    const unsubscribe = agent.subscribe((event) => {
      if (event.type === 'tool_execution_start') {
        onToolEvent?.({
          type: 'tool-started',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          args: (event as any).args,
        });
      }
      if (event.type === 'tool_execution_end') {
        let toolOutput: string | undefined;
        try {
          toolOutput =
            typeof event.result === 'string'
              ? event.result
              : JSON.stringify(event.result, null, 2);
        } catch {
          toolOutput = String(event.result);
        }
        onToolEvent?.({
          type: 'tool-completed',
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          isError: event.isError,
          toolOutput,
        });
      }
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        onDelta(event.assistantMessageEvent.delta);
      }
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'thinking_delta'
      ) {
        onThinkingDelta(event.assistantMessageEvent.delta);
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        finalMessage = event.message;
      }
    });
    const abort = () => agent.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      await agent.prompt(input.prompt);
      if (signal.aborted) throw new Error('AGENT_CANCELLED');
      if (agent.state.errorMessage) throw new Error(agent.state.errorMessage);
      const text = assistantText(finalMessage);
      if (!text) throw new Error('MODEL_EMPTY_RESPONSE');

      this.logger.info('agent.freeform_output.completed', {
        runId: input.runId,
        sessionId: input.sessionId,
      });
      const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
      return title
        ? {
            message: text,
            article: { title, markdown: text },
          }
        : { message: text };
    } finally {
      signal.removeEventListener('abort', abort);
      unsubscribe();
    }
  }

  cancelSession(sessionId: string): void {
    this.activeAgents.get(sessionId)?.abort();
  }

  deleteSession(sessionId: string): void {
    this.activeAgents.get(sessionId)?.abort();
    this.activeAgents.delete(sessionId);
  }
}

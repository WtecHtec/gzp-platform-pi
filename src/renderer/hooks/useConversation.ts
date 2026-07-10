import { useEffect, useRef, useState } from 'react';
import type {
  ArticleVersion,
  ChatMessage,
  DesktopApi,
  ToolStep,
  TopicOption,
  WritingSession,
} from '../../shared/contracts';
import { readableAgentError } from '../view-models/agentViewModel';

export interface ConversationState {
  isThinking: boolean;
  streamedDraft: string;
  streamedThinking: string;
  toolSteps: ToolStep[];
  submitContent: (rawContent: string) => Promise<void>;
  chooseTopic: (topic: TopicOption) => Promise<void>;
  cancelRun: () => Promise<void>;
}

/**
 * Filter the chat history to only include completed successful turns.
 * A turn consists of a user message and subsequent assistant responses.
 * If the turn was cancelled or resulted in an error (e.g. isError is true
 * or content indicates stop/failure), we filter it out.
 */
function filterSuccessfulHistory(history: ChatMessage[]): ChatMessage[] {
  const turns: ChatMessage[][] = [];
  let currentTurn: ChatMessage[] = [];

  history.forEach((msg) => {
    if (msg.role === 'user') {
      if (currentTurn.length > 0) {
        turns.push(currentTurn);
      }
      currentTurn = [msg];
    } else {
      currentTurn.push(msg);
    }
  });
  if (currentTurn.length > 0) {
    turns.push(currentTurn);
  }

  const successfulTurns = turns.filter((turn) => {
    // A turn must start with a user message
    if (turn[0]?.role !== 'user') return false;

    // Find assistant messages in this turn
    const assistantMsgs = turn.slice(1).filter((m) => m.role === 'assistant');
    if (assistantMsgs.length === 0) return false; // Unanswered

    const lastAssistantMsg = assistantMsgs[assistantMsgs.length - 1];

    // Check if the last assistant message is an error/cancelled
    if ((lastAssistantMsg as any).isError) return false;

    const content = lastAssistantMsg.content || '';
    if (
      content.startsWith('已停止生成') ||
      content.startsWith('生成失败：') ||
      content.startsWith('尚未配置 API Key') ||
      content.startsWith('模型返回的数据格式不完整')
    ) {
      return false;
    }

    return true;
  });

  return successfulTurns.flat();
}

function createSessionTitleFromPrompt(content: string): string {
  const compact = content.replace(/\s+/g, '');
  return compact.slice(0, 6) || '未命名文章';
}

/**
 * Encapsulates all agent-run state and logic:
 * streaming, tool-call tracking, topic selection, and session updates.
 */
export default function useConversation(
  api: DesktopApi,
  session: WritingSession,
  onUpdate: (session: WritingSession) => Promise<void>,
  onOpenPreview?: () => void,
): ConversationState {
  const [isThinking, setIsThinking] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string>();
  const [streamedDraft, setStreamedDraft] = useState('');
  const [streamedThinking, setStreamedThinking] = useState('');
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([]);

  /**
   * Mirror of toolSteps state that is always current inside async closures.
   * State updates are batched by React so we can't rely on the closure value.
   */
  const toolStepsRef = useRef<ToolStep[]>([]);
  const thinkingRef = useRef('');
  const currentRunRef = useRef<string | undefined>(undefined);
  const sessionRef = useRef(session);

  // Keep sessionRef always updated with the latest session prop
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    setStreamedDraft('');
    setStreamedThinking('');
    setToolSteps([]);
    setIsThinking(false);
    currentRunRef.current = undefined;
    setCurrentRunId(undefined);
    toolStepsRef.current = [];
    thinkingRef.current = '';
  }, [session.id]);

  useEffect(() => {
    const unsubscribe = api.agent.onEvent((event) => {
      const currentSession = sessionRef.current;
      if (
        event.runId === currentRunRef.current &&
        event.sessionId === currentSession.id &&
        event.type === 'delta' &&
        event.delta
      ) {
        setStreamedDraft((cur) => cur + event.delta);
      }
      if (
        event.runId === currentRunRef.current &&
        event.sessionId === currentSession.id &&
        event.type === 'thinking-delta' &&
        event.delta
      ) {
        thinkingRef.current += event.delta;
        setStreamedThinking(thinkingRef.current);
      }
      if (
        event.runId === currentRunRef.current &&
        event.type === 'tool-started' &&
        event.toolCallId &&
        event.toolName
      ) {
        if (event.toolName === 'write') {
          onOpenPreview?.();
        }
        setToolSteps((cur) => {
          const next: ToolStep[] = [
            ...cur,
            {
              id: event.toolCallId as string,
              name: event.toolName as string,
              completed: false,
              isError: false,
              args: event.args,
            },
          ];
          toolStepsRef.current = next;
          return next;
        });
      }
      if (event.type === 'tool-completed' && event.toolCallId) {
        if (event.toolName === 'write') {
          onOpenPreview?.();
        }
        setToolSteps((cur) => {
          const next = cur.map((step) =>
            step.id === event.toolCallId
              ? {
                  ...step,
                  completed: true,
                  isError: Boolean(event.isError),
                  output: event.toolOutput,
                }
              : step,
          );
          toolStepsRef.current = next;
          return next;
        });

        // If a file is successfully written, capture the clean file content as a new draft version
        if (event.toolName === 'write' && !event.isError) {
          const targetStep = toolStepsRef.current.find(
            (s) => s.id === event.toolCallId,
          );
          if (targetStep?.args && typeof targetStep.args.content === 'string') {
            const filePath = targetStep.args.path || 'article.md';
            const cleanTitle = filePath.split(/[/\\]/).pop() || '未命名文章';
            const cleanMarkdown = targetStep.args.content;

            const activeSession = sessionRef.current;
            const newVersion: ArticleVersion = {
              id: `version-${Date.now()}`,
              title: cleanTitle,
              markdown: cleanMarkdown,
              label: cleanTitle,
              createdAt: new Date().toISOString(),
            };

            onUpdate({
              ...activeSession,
              versions: [...activeSession.versions, newVersion],
              activeVersionId: newVersion.id,
            });
          }
        }
      }
    });
    return () => unsubscribe();
  }, [api, onOpenPreview, onUpdate]);

  function resetRunState() {
    setIsThinking(false);
    currentRunRef.current = undefined;
    setCurrentRunId(undefined);
    toolStepsRef.current = [];
    thinkingRef.current = '';
    setToolSteps([]);
    setStreamedDraft('');
    setStreamedThinking('');
  }

  const submitContent = async (rawContent: string) => {
    const content = rawContent.trim();
    if (!content || isThinking) return;

    const userMessage: ChatMessage = {
      id: `message-${Date.now()}`,
      role: 'user',
      kind: 'text',
      content,
      createdAt: new Date().toISOString(),
    };
    const latestSession = sessionRef.current;
    const isFirstUserMessage = !latestSession.messages.some(
      (msg) => msg.role === 'user',
    );
    const nextSession = {
      ...latestSession,
      title: isFirstUserMessage
        ? createSessionTitleFromPrompt(content)
        : latestSession.title,
      messages: [...latestSession.messages, userMessage],
    };
    await onUpdate(nextSession);

    toolStepsRef.current = [];
    thinkingRef.current = '';
    setToolSteps([]);
    setStreamedDraft('');
    setStreamedThinking('');
    setIsThinking(true);
    const runId = `run-${Date.now()}`;
    currentRunRef.current = runId;
    setCurrentRunId(runId);

    try {
      const cleanHistory = filterSuccessfulHistory(latestSession.messages);

      const result = await api.agent.run({
        runId,
        sessionId: latestSession.id,
        prompt: content,
        history: cleanHistory,
      });

      const wroteFile = toolStepsRef.current.some(
        (s) => s.name === 'write' && !s.isError,
      );

      if (result.article && !wroteFile) {
        const currentSession = sessionRef.current;
        const version: ArticleVersion = {
          id: `version-${Date.now()}`,
          title: result.article.title,
          markdown: result.article.markdown,
          label: result.article.title,
          createdAt: new Date().toISOString(),
        };
        await onUpdate({
          ...currentSession,
          title: version.title,
          versions: [...currentSession.versions, version],
          activeVersionId: version.id,
          messages: [
            ...currentSession.messages,
            {
              id: `message-${Date.now()}`,
              role: 'assistant',
              kind: 'text',
              content: result.message,
              thinkingContent: thinkingRef.current || undefined,
              createdAt: new Date().toISOString(),
              toolSteps:
                toolStepsRef.current.length > 0
                  ? [...toolStepsRef.current]
                  : undefined,
            },
          ],
        });
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `message-${Date.now()}`,
        role: 'assistant',
        kind: result.topics ? 'topics' : 'text',
        content: result.message,
        thinkingContent: thinkingRef.current || undefined,
        topics: result.topics,
        createdAt: new Date().toISOString(),
        toolSteps:
          toolStepsRef.current.length > 0
            ? [...toolStepsRef.current]
            : undefined,
      };

      const currentSession = sessionRef.current;
      await onUpdate({
        ...currentSession,
        messages: [...currentSession.messages, assistantMessage],
      });
    } catch (error) {
      const currentSession = sessionRef.current;
      let errorMsg = readableAgentError(error);
      try {
        const config = await api.settings.getModel();
        errorMsg += `\n\n---\n**当前模型配置诊断**：\n- **API 地址 (Base URL)**: \`${config.baseUrl}\`\n- **模型名称**: \`${config.model}\`\n- **密钥已配置**: \`${config.apiKeyConfigured ? '是' : '否'}\`\n\n*请在设置面板测试连接或更换可用的模型与服务商。*`;
      } catch {}

      await onUpdate({
        ...currentSession,
        messages: [
          ...currentSession.messages,
          {
            id: `message-${Date.now()}`,
            role: 'assistant',
            kind: 'text',
            content: errorMsg,
            thinkingContent: thinkingRef.current || undefined,
            createdAt: new Date().toISOString(),
            toolSteps:
              toolStepsRef.current.length > 0
                ? [...toolStepsRef.current]
                : undefined,
            isError: true,
          },
        ],
      });
    } finally {
      resetRunState();
    }
  };

  const chooseTopic = async (topic: TopicOption) => {
    if (isThinking) return;

    const selectedMessage: ChatMessage = {
      id: `message-${Date.now()}`,
      role: 'user',
      kind: 'text',
      content: `选择方向：${topic.title}`,
      createdAt: new Date().toISOString(),
    };
    const latestSession = sessionRef.current;
    const pendingSession = {
      ...latestSession,
      title: topic.title,
      messages: [...latestSession.messages, selectedMessage],
    };
    await onUpdate(pendingSession);

    toolStepsRef.current = [];
    thinkingRef.current = '';
    setToolSteps([]);
    setIsThinking(true);
    setStreamedDraft('');
    setStreamedThinking('');
    const runId = `run-${Date.now()}`;
    currentRunRef.current = runId;
    setCurrentRunId(runId);

    try {
      const cleanHistory = filterSuccessfulHistory(latestSession.messages);

      const result = await api.agent.run({
        runId,
        sessionId: latestSession.id,
        prompt: `选择方向：${topic.title}`,
        history: cleanHistory,
      });

      const wroteFile = toolStepsRef.current.some(
        (s) => s.name === 'write' && !s.isError,
      );

      if (result.article && !wroteFile) {
        const currentSession = sessionRef.current;
        const version: ArticleVersion = {
          id: `version-${Date.now()}`,
          title: result.article.title,
          markdown: result.article.markdown,
          label: result.article.title,
          createdAt: new Date().toISOString(),
        };
        await onUpdate({
          ...currentSession,
          title: version.title,
          versions: [...currentSession.versions, version],
          activeVersionId: version.id,
          messages: [
            ...currentSession.messages,
            {
              id: `message-${Date.now() + 1}`,
              role: 'assistant',
              kind: 'text',
              content: result.message,
              thinkingContent: thinkingRef.current || undefined,
              createdAt: new Date().toISOString(),
              toolSteps:
                toolStepsRef.current.length > 0
                  ? [...toolStepsRef.current]
                  : undefined,
            },
          ],
        });
      } else {
        const currentSession = sessionRef.current;
        await onUpdate({
          ...currentSession,
          messages: [
            ...currentSession.messages,
            {
              id: `message-${Date.now() + 1}`,
              role: 'assistant',
              kind: result.topics ? 'topics' : 'text',
              content: result.message,
              thinkingContent: thinkingRef.current || undefined,
              topics: result.topics,
              createdAt: new Date().toISOString(),
              toolSteps:
                toolStepsRef.current.length > 0
                  ? [...toolStepsRef.current]
                  : undefined,
            },
          ],
        });
      }
    } catch (error) {
      const currentSession = sessionRef.current;
      let errorMsg = readableAgentError(error);
      try {
        const config = await api.settings.getModel();
        errorMsg += `\n\n---\n**当前模型配置诊断**：\n- **API 地址 (Base URL)**: \`${config.baseUrl}\`\n- **模型名称**: \`${config.model}\`\n- **密钥已配置**: \`${config.apiKeyConfigured ? '是' : '否'}\`\n\n*请在设置面板测试连接或更换可用的模型与服务商。*`;
      } catch {}

      await onUpdate({
        ...currentSession,
        messages: [
          ...currentSession.messages,
          {
            id: `message-${Date.now() + 1}`,
            role: 'assistant',
            kind: 'text',
            content: errorMsg,
            thinkingContent: thinkingRef.current || undefined,
            createdAt: new Date().toISOString(),
            toolSteps:
              toolStepsRef.current.length > 0
                ? [...toolStepsRef.current]
                : undefined,
            isError: true,
          },
        ],
      });
    } finally {
      resetRunState();
    }
  };

  const cancelRun = async () => {
    if (currentRunId) await api.agent.cancel(currentRunId);
  };

  return {
    isThinking,
    streamedDraft,
    streamedThinking,
    toolSteps,
    submitContent,
    chooseTopic,
    cancelRun,
  };
}

/* eslint-disable react/no-unstable-nested-components, react/jsx-props-no-spreading, react/no-array-index-key, no-console */
import {
  AssistantRuntimeProvider,
  MessagePrimitive,
  ThreadPrimitive,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import React, { useMemo, useState } from 'react';
import type {
  ChatMessage,
  DesktopApi,
  WritingSession,
} from '../../../shared/contracts';
import useConversation from '../../hooks/useConversation';
import Icon from '../components/Icon';
import ThinkingPanel from '../components/ThinkingPanel';
import TopicChoices from '../components/TopicChoices';
import ToolStepsPanel from '../components/ToolStepsPanel';
import ChatInputArea from '../components/ChatInputArea';

function formatMarkdownText(
  node: React.ReactNode,
  onPreview: (title: string) => void,
): React.ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(/([a-zA-Z0-9_\u4e00-\u9fa5《》/\-\\.—]+\.md)/g);
    if (parts.length > 1) {
      return parts.map((part, index) => {
        if (part.endsWith('.md')) {
          return (
            <button
              key={`${part}-${index}`}
              className="preview-trigger-link"
              onClick={() => onPreview(part)}
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                display: 'inline',
              }}
            >
              {part}
            </button>
          );
        }
        return part;
      });
    }
  }
  if (Array.isArray(node)) {
    return node.map((child) => formatMarkdownText(child, onPreview));
  }
  return node;
}

/**
 * Page component: Conversation.
 *
 * Calls the useConversation hook for all business logic,
 * then feeds the result into the @assistant-ui runtime for rendering.
 * The only UI-specific logic here is thread-to-runtime mapping.
 */
export default function ConversationPage({
  session,
  onUpdate,
  onOpenPreview,
  api,
}: {
  session: WritingSession;
  onUpdate: (session: WritingSession) => Promise<void>;
  onOpenPreview: () => void;
  api: DesktopApi;
}) {
  const {
    isThinking,
    streamedDraft,
    streamedThinking,
    toolSteps,
    submitContent,
    chooseTopic,
    cancelRun,
  } = useConversation(api, session, onUpdate, onOpenPreview);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  /** Append in-progress streamed draft to message list for live display */
  const displayMessages: ChatMessage[] =
    streamedDraft || streamedThinking || toolSteps.length > 0
      ? [
          ...session.messages,
          {
            id: `stream-current`,
            role: 'assistant' as const,
            kind: 'text' as const,
            content: streamedDraft,
            thinkingContent: streamedThinking || undefined,
            createdAt: new Date().toISOString(),
          },
        ]
      : session.messages;

  const runtime = useExternalStoreRuntime<ChatMessage>({
    messages: displayMessages,
    isRunning: isThinking,
    convertMessage: (message): ThreadMessageLike => ({
      id: message.id,
      role: message.role,
      content: [{ type: 'text', text: message.content }],
      createdAt: new Date(message.createdAt),
      status:
        message.id === 'stream-current' && isThinking
          ? { type: 'running' }
          : undefined,
      metadata: { custom: { originalId: message.id } },
    }),
    onNew: async (message: AppendMessage) => {
      const text = message.content
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('');
      await submitContent(text);
    },
    onCancel: cancelRun,
  });

  /** The last set of topics in the session drives the topic-choice UI */
  const lastTopics = [...session.messages]
    .reverse()
    .find((m) => m.topics)?.topics;

  const handleClickWriteFile = async (
    filePath: string,
    fileContent: string,
  ) => {
    const cleanTitle = filePath.split(/[/\\]/).pop() || '未命名文章';
    const existing = session.versions.find(
      (v) => v.title === cleanTitle && v.markdown === fileContent,
    );
    if (existing) {
      await onUpdate({
        ...session,
        activeVersionId: existing.id,
      });
      onOpenPreview();
    } else {
      const newVersion = {
        id: `version-${Date.now()}`,
        title: cleanTitle,
        markdown: fileContent,
        label: cleanTitle,
        createdAt: new Date().toISOString(),
      };
      await onUpdate({
        ...session,
        versions: [...session.versions, newVersion],
        activeVersionId: newVersion.id,
      });
      onOpenPreview();
    }
  };

  const customMarkdownComponents = useMemo(
    () => ({
      a: ({ href, children }: any) => {
        const isMd = href?.endsWith('.md') || href?.includes('.md');
        if (isMd) {
          return (
            <button
              onClick={async (e) => {
                e.preventDefault();
                const cleanTitle = href.split(/[/\\]/).pop();
                const existing = session.versions.find((v) => {
                  const cleanVTitle = v.title.split(/[/\\]/).pop();
                  return cleanVTitle === cleanTitle;
                });
                if (existing) {
                  await onUpdate({ ...session, activeVersionId: existing.id });
                  onOpenPreview();
                } else {
                  onOpenPreview();
                }
              }}
              className="preview-trigger-link"
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                display: 'inline',
              }}
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href && api.openExternalUrl) {
                api.openExternalUrl(href).catch((err) => console.error(err));
              }
            }}
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
          >
            {children}
          </a>
        );
      },
      p: ({ children }: any) => {
        return (
          <p>
            {formatMarkdownText(children, async (title) => {
              const cleanTitle = title.split(/[/\\]/).pop();
              const existing = session.versions.find((v) => {
                const cleanVTitle = v.title.split(/[/\\]/).pop();
                return cleanVTitle === cleanTitle;
              });
              if (existing) {
                await onUpdate({ ...session, activeVersionId: existing.id });
                onOpenPreview();
              } else {
                onOpenPreview();
              }
            })}
          </p>
        );
      },
    }),
    [session, onUpdate, onOpenPreview, api],
  );



  return (
    <main className="conversation">
      <header className="conversation-header">
        <div>
          <h1>{session.title}</h1>
          <span>自动保存于本地</span>
        </div>
        <div className="conversation-header-actions">
          <button
            aria-expanded={isMoreOpen}
            aria-label="更多操作"
            className="icon-button"
            onClick={() => setIsMoreOpen((cur) => !cur)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsMoreOpen(false);
            }}
            type="button"
          >
            <Icon name="more" size={18} />
          </button>
          {isMoreOpen ? (
            <div className="conversation-menu" role="menu">
              <button
                disabled={session.versions.length === 0}
                onClick={() => {
                  setIsMoreOpen(false);
                  onOpenPreview();
                }}
                role="menuitem"
                type="button"
              >
                <Icon name="document" size={15} />
                打开预览
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root className="assistant-thread">
          <ThreadPrimitive.Viewport className="messages">
            <ThreadPrimitive.Messages>
              {({ message }) => {
                const originalMsg = session.messages.find(
                  (m) => m.id === message.metadata.custom.originalId,
                );
                return (
                  <MessagePrimitive.Root className={`message ${message.role}`}>
                    <div className="message-role">
                      {message.role === 'user' ? '用户' : '写作助手'}
                    </div>

                    {/* Show tool steps inside the same bubble, above text */}
                    {message.role === 'assistant' && (
                      <>
                        <ThinkingPanel
                          content={
                            originalMsg
                              ? originalMsg.thinkingContent || ''
                              : streamedThinking
                          }
                          initiallyExpanded={!originalMsg}
                        />
                        {/* Live tool steps */}
                        {!originalMsg && toolSteps.length > 0 && (
                          <ToolStepsPanel
                            steps={toolSteps}
                            onClickWriteFile={handleClickWriteFile}
                            onOpenPreview={onOpenPreview}
                          />
                        )}
                        {/* Saved tool steps */}
                        {originalMsg?.toolSteps &&
                          originalMsg.toolSteps.length > 0 && (
                            <ToolStepsPanel
                              steps={originalMsg.toolSteps}
                              onClickWriteFile={handleClickWriteFile}
                              onOpenPreview={onOpenPreview}
                            />
                          )}
                      </>
                    )}

                    {/* Show content (either live streaming or original saved content) */}
                    {(() => {
                      const textVal = originalMsg
                        ? originalMsg.content
                        : message.id === 'stream-current'
                        ? streamedDraft
                        : (message.content as any[])
                            ?.filter((p: any) => p.type === 'text')
                            .map((p: any) => p.text)
                            .join('') ?? '';
                      return textVal ? (
                        <div className="message-content">
                          <ReactMarkdown components={customMarkdownComponents as any}>
                            {textVal}
                          </ReactMarkdown>
                        </div>
                      ) : null;
                    })()}

                    {/* Topic choices attached to the last topics message */}
                    {message.metadata.custom.originalId ===
                      session.messages.find(
                        (item) => item.topics === lastTopics,
                      )?.id && lastTopics ? (
                      <TopicChoices
                        onSelect={chooseTopic}
                        options={lastTopics}
                      />
                    ) : null}
                  </MessagePrimitive.Root>
                );
              }}
            </ThreadPrimitive.Messages>

            {/* Thinking indicator while no streamed text yet */}
            {isThinking && !streamedDraft && !streamedThinking ? (
              <div className="generating">
                <div className="thinking">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            ) : null}

            <ThreadPrimitive.ViewportFooter className="assistant-footer">
              <ChatInputArea
                isThinking={isThinking}
                onSubmit={submitContent}
                onCancel={cancelRun}
              />
            </ThreadPrimitive.ViewportFooter>
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </main>
  );
}

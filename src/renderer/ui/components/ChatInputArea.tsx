/* eslint-disable react/jsx-props-no-spreading, react/require-default-props */
import React, { useMemo, useRef, useState } from 'react';
import type { SkillDescriptor } from '../../../shared/contracts';

/** Threshold in characters above which a pasted plain-text block is treated as an attachment file. */
const LONG_PASTE_THRESHOLD = 400;

export interface Attachment {
  /** Display name shown in the pill */
  name: string;
  /** Raw text content of the file */
  content: string;
}

/**
 * Formats one or more attachments as a prefixed block so the agent
 * can clearly distinguish "user message" from "provided file content".
 */
export function buildPromptWithAttachments(
  userText: string,
  attachments: Attachment[],
): string {
  const blocks = attachments.map(
    (a) => `<附件 name="${a.name}">\n${a.content}\n</附件>`,
  );
  if (blocks.length === 0) return userText;
  return `${blocks.join('\n\n')}\n\n${userText}`.trim();
}

interface ChatInputAreaProps {
  disabled?: boolean;
  isThinking?: boolean;
  skills?: SkillDescriptor[];
  onSubmit: (prompt: string) => void;
  onCancel?: () => void;
}

interface MentionState {
  start: number;
  end: number;
  query: string;
}

function getMentionState(value: string, caret: number): MentionState | null {
  const beforeCaret = value.slice(0, caret);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;

  const prefix = atIndex === 0 ? '' : beforeCaret[atIndex - 1];
  if (prefix && !/\s/.test(prefix)) return null;

  const query = beforeCaret.slice(atIndex + 1);
  if (/\s/.test(query)) return null;

  return { start: atIndex, end: caret, query };
}

export default function ChatInputArea({
  disabled = false,
  isThinking = false,
  skills = [],
  onSubmit,
  onCancel = undefined,
}: ChatInputAreaProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentionState, setMentionState] = useState<MentionState | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mentionOptions = useMemo(() => {
    if (!mentionState) return [];
    const query = mentionState.query.trim().toLowerCase();
    return skills
      .filter((skill) => skill.status !== 'not_installed')
      .filter((skill) => {
        if (!query) return true;
        return (
          skill.name.toLowerCase().includes(query) ||
          skill.id.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [mentionState, skills]);

  const isMentionOpen = mentionState !== null && mentionOptions.length > 0;

  const updateMentionFromTextarea = (value: string, selectionStart: number) => {
    const nextMentionState = getMentionState(value, selectionStart);
    setMentionState(nextMentionState);
    setActiveMentionIndex(0);
  };

  const selectMention = (skill: SkillDescriptor) => {
    if (!mentionState) return;
    const insertion = `${skill.name} `;
    const nextText = `${text.slice(0, mentionState.start)}${insertion}${text.slice(
      mentionState.end,
    )}`;
    const nextCaret = mentionState.start + insertion.length;
    setText(nextText);
    setMentionState(null);
    setActiveMentionIndex(0);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  // ── Paste handler ────────────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text/plain');
    if (pastedText.length >= LONG_PASTE_THRESHOLD) {
      e.preventDefault();
      const name = `粘贴内容-${Date.now()}.txt`;
      setAttachments((prev) => [...prev, { name, content: pastedText }]);
    }
    // Short pastes fall through to the default textarea behaviour
  };

  // ── File upload ───────────────────────────────────────────────────────
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        setAttachments((prev) => [
          ...prev,
          { name: file.name, content: content ?? '' },
        ]);
      };
      reader.readAsText(file, 'utf-8');
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    // reset so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Drag & drop ───────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // ── Remove attachment ─────────────────────────────────────────────────
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const prompt = buildPromptWithAttachments(text.trim(), attachments);
    if (!prompt || isThinking) return;
    onSubmit(prompt);
    setText('');
    setAttachments([]);
    setMentionState(null);
    setActiveMentionIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isMentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveMentionIndex((index) => (index + 1) % mentionOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveMentionIndex(
          (index) =>
            (index - 1 + mentionOptions.length) % mentionOptions.length,
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionOptions[activeMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionState(null);
        setActiveMentionIndex(0);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="composer chat-input-area"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Attachment pills */}
      {attachments.length > 0 ? (
        <div className="chat-attachments">
          {attachments.map((a, i) => (
            <div
              className="chat-attachment-pill"
              key={`${a.name}-${a.content.length}-${a.content.slice(0, 12)}`}
            >
              <span className="chat-attachment-icon">📄</span>
              <span className="chat-attachment-name" title={a.name}>
                {a.name}
              </span>
              <button
                aria-label={`移除 ${a.name}`}
                className="chat-attachment-remove"
                onClick={() => removeAttachment(i)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* Textarea */}
      <textarea
        aria-label="输入写作需求"
        className="chat-input-textarea"
        disabled={disabled || isThinking}
        onChange={(e) => {
          setText(e.target.value);
          updateMentionFromTextarea(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => {
          updateMentionFromTextarea(
            e.currentTarget.value,
            e.currentTarget.selectionStart,
          );
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={
          attachments.length > 0
            ? '告诉我怎么处理这些附件…'
            : '描述主题、粘贴素材，或告诉我你想修改什么…'
        }
        ref={textareaRef}
        rows={3}
        value={text}
      />

      {isMentionOpen ? (
        <div className="skill-mention-menu" role="listbox">
          {mentionOptions.map((skill, index) => (
            <button
              aria-selected={index === activeMentionIndex}
              className={`skill-mention-option${
                index === activeMentionIndex ? ' active' : ''
              }`}
              key={skill.id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMention(skill);
              }}
              role="option"
              type="button"
            >
              <span className="skill-mention-name">{skill.name}</span>
              <span className="skill-mention-id">{skill.id}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Footer: upload + send/cancel */}
      <div className="chat-input-footer">
        <div className="chat-input-actions-left">
          {/* Hidden real file input */}
          <input
            accept="text/*,.md,.txt,.html,.htm,.json,.csv,.xml,.yaml,.yml"
            multiple
            onChange={handleFileInputChange}
            ref={fileInputRef}
            style={{ display: 'none' }}
            type="file"
          />
          <button
            aria-label="上传文件"
            className="chat-upload-button"
            disabled={disabled || isThinking}
            onClick={() => fileInputRef.current?.click()}
            title="上传文件（文本类型）"
            type="button"
          >
            📎
          </button>
        </div>

        <div className="chat-input-actions-right">
          {isThinking ? (
            <button className="cancel-button" onClick={onCancel} type="button">
              停止
            </button>
          ) : (
            <button
              aria-label="发送"
              className="send-button"
              disabled={disabled || (!text.trim() && attachments.length === 0)}
              onClick={handleSubmit}
              type="button"
            >
              ↑
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

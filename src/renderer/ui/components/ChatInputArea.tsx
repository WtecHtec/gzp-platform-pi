/* eslint-disable react/jsx-props-no-spreading */
import React, { useRef, useState } from 'react';

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
  onSubmit: (prompt: string) => void;
  onCancel?: () => void;
}

export default function ChatInputArea({
  disabled,
  isThinking,
  onSubmit,
  onCancel,
}: ChatInputAreaProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
            <div className="chat-attachment-pill" key={`${a.name}-${i}`}>
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
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={
          attachments.length > 0
            ? '告诉我怎么处理这些附件…'
            : '描述主题、粘贴素材，或告诉我你想修改什么…'
        }
        rows={3}
        value={text}
      />

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
            <button
              className="cancel-button"
              onClick={onCancel}
              type="button"
            >
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

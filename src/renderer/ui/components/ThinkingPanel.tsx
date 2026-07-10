import { useState } from 'react';

export default function ThinkingPanel({
  content,
  initiallyExpanded = false,
}: {
  content: string;
  initiallyExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const cleanContent = content.trim();

  if (!cleanContent) return null;

  return (
    <div className="thinking-panel">
      <button
        aria-expanded={isExpanded}
        className="thinking-panel-header"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="thinking-panel-title">思考过程</span>
        <span className={`thinking-panel-chevron ${isExpanded ? 'open' : ''}`}>
          ▾
        </span>
      </button>
      {isExpanded ? <pre className="thinking-panel-body">{content}</pre> : null}
    </div>
  );
}

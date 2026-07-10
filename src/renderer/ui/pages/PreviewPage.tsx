import { useEffect, useState } from 'react';
import type { DesktopApi, WritingSession } from '../../../shared/contracts';
import Icon from '../components/Icon';

type PreviewMode = 'source' | 'render';

function renderMarkdown(markdown: string) {
  let cursor = 0;
  return markdown.split('\n').map((line) => {
    const key = `${cursor}-${line}`;
    cursor += line.length + 1;
    if (line.startsWith('## ')) return <h3 key={key}>{line.slice(3)}</h3>;
    if (!line.trim()) return <div className="paragraph-gap" key={key} />;
    return <p key={key}>{line}</p>;
  });
}

export default function PreviewPage({
  session,
  onClose,
  onVersionChange,
  api,
}: {
  session: WritingSession;
  onClose: () => void;
  onVersionChange: (versionId: string) => void;
  api: DesktopApi;
}) {
  const active =
    session.versions.find((v) => v.id === session.activeVersionId) ||
    session.versions.at(-1);

  const [mode, setMode] = useState<PreviewMode>('render');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    setMode('render');
  }, [active?.id, active?.markdown, active?.title]);

  const fileName = active?.title || active?.label || '';
  const lowerFileName = fileName.toLowerCase();
  const isHtml =
    lowerFileName.endsWith('.html') || lowerFileName.endsWith('.htm');
  const isMarkdown =
    lowerFileName.endsWith('.md') || lowerFileName.endsWith('.markdown');
  const canRenderInline = isHtml || isMarkdown;

  const handleCopy = async () => {
    if (!active) return;
    try {
      if (isHtml) {
        // Copy both text/html and text/plain to allow pasting with full styles into WeChat/other editors
        const blobHtml = new Blob([active.markdown], { type: 'text/html' });
        const blobText = new Blob([active.markdown], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText,
        });
        await navigator.clipboard.write([item]);
      } else {
        // Default plain text/markdown copy
        await navigator.clipboard.writeText(active.markdown);
      }
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await api.settings.openWorkspaceDirectory();
    } catch (err) {
      console.error('Failed to open workspace directory:', err);
    }
  };

  const handleOpenFile = async () => {
    if (!active) return;
    try {
      await api.files.openWorkspaceFile(fileName);
    } catch (err) {
      console.error('Failed to open workspace file:', err);
    }
  };

  return (
    <aside className="preview">
      <header className="preview-header">
        <div>
          <Icon name="document" size={17} />
          <strong>预览</strong>
        </div>
        <div className="preview-header-controls">
          {active ? (
            <select
              aria-label="按文件名称筛选"
              onChange={(e) => onVersionChange(e.target.value)}
              value={active.id}
            >
              {session.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title || v.label}
                </option>
              ))}
            </select>
          ) : null}
          {active ? (
            <div className="preview-mode-toggle" role="group">
              <button
                aria-label="查看代码原文"
                className={mode === 'source' ? 'active' : ''}
                onClick={() => setMode('source')}
                title="代码原文"
                type="button"
              >
                <Icon name="code" size={15} />
              </button>
              <button
                aria-label="查看代码渲染"
                className={mode === 'render' ? 'active' : ''}
                onClick={() => setMode('render')}
                title="代码渲染"
                type="button"
              >
                <Icon name="render" size={15} />
              </button>
            </div>
          ) : null}
          <button
            aria-label="关闭预览"
            className="preview-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
      </header>

      <div className="preview-scroll">
        {active && mode === 'source' ? (
          <pre className="source-preview">{active.markdown}</pre>
        ) : null}

        {active && mode === 'render' && isHtml ? (
          <div className="html-preview-sandbox">
            <iframe sandbox="" srcDoc={active.markdown} title="HTML预览" />
          </div>
        ) : null}

        {active && mode === 'render' && isMarkdown ? (
          <article className="article-paper">
            <h2>{fileName}</h2>
            <div className="article-byline">公众号写作台 · Markdown 渲染</div>
            {renderMarkdown(active.markdown)}
          </article>
        ) : null}

        {active && mode === 'render' && !canRenderInline ? (
          <div className="preview-empty">
            <Icon name="document" size={26} />
            <strong>此文件无法在这里渲染</strong>
            <span>请使用系统预览打开文件。</span>
            <button onClick={handleOpenFile} type="button">
              打开文件预览
            </button>
          </div>
        ) : null}

        {!active ? (
          <div className="preview-empty">
            <Icon name="document" size={26} />
            <strong>还没有文章草稿</strong>
            <span>选定一个方向后，草稿会显示在这里。</span>
          </div>
        ) : (
          <span className="sr-only">已有文章草稿</span>
        )}
      </div>

      <footer className="preview-actions">
        {active ? (
          <>
            <button onClick={handleCopy} type="button">
              {copySuccess ? '已复制' : '复制'}
            </button>
            {!canRenderInline ? (
              <button onClick={handleOpenFile} type="button">
                <Icon name="document" size={16} />
                打开文件预览
              </button>
            ) : null}
            <button
              className="primary"
              onClick={handleOpenFolder}
              type="button"
            >
              <Icon name="folder" size={16} />
              打开所在路径
            </button>
          </>
        ) : null}
      </footer>
    </aside>
  );
}

import { useState } from 'react';
import type { ToolStep } from '../../../shared/contracts';
import { toToolStepViewModel } from '../../view-models/agentViewModel';

/**
 * Presentational component for tool-call step records.
 * Manages its own expand/collapse state for both the entire steps list (panel level)
 * and individual steps' output logs (item level).
 */
export default function ToolStepsPanel({
  steps,
  onOpenPreview,
  onClickWriteFile,
}: {
  steps: ToolStep[];
  onOpenPreview?: () => void;
  onClickWriteFile?: (filePath: string, fileContent: string) => void;
}) {
  const isRunning = steps.some((s) => !s.completed);
  const [isPanelExpanded, setIsPanelExpanded] = useState(isRunning);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const successCount = steps.filter((s) => s.completed && !s.isError).length;
  const errorCount = steps.filter((s) => s.isError).length;
  const pendingCount = steps.filter((s) => !s.completed).length;

  let summaryText = `执行步骤 (共 ${steps.length} 步)`;
  if (pendingCount > 0) {
    summaryText = `正在执行步骤 (${steps.length - pendingCount}/${steps.length})`;
  } else if (errorCount > 0) {
    summaryText = `部分步骤执行失败 (成功 ${successCount}, 失败 ${errorCount})`;
  } else {
    summaryText = `步骤执行完成 (共 ${steps.length} 步)`;
  }

  return (
    <div className="tool-steps-container">
      <button
        aria-expanded={isPanelExpanded}
        className="tool-steps-header"
        onClick={() => setIsPanelExpanded(!isPanelExpanded)}
        type="button"
      >
        <span className="tool-steps-summary">{summaryText}</span>
        <span className={`tool-steps-chevron ${isPanelExpanded ? 'open' : ''}`}>
          ▾
        </span>
      </button>

      {isPanelExpanded ? (
        <div className="tool-steps-list">
          {steps.map((step) => {
            const vm = toToolStepViewModel(step);
            return (
              <div className="tool-step-item" key={vm.id}>
                <div
                  className="tool-step-row"
                  onClick={() => {
                    setExpandedId(expandedId === vm.id ? null : vm.id);
                    if (vm.name === 'write' && step.args?.content) {
                      onClickWriteFile?.(step.args.path, step.args.content);
                    } else if (vm.name === 'write') {
                      onOpenPreview?.();
                    }
                  }}
                  role="button"
                  style={{ cursor: 'pointer' }}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedId(expandedId === vm.id ? null : vm.id);
                      if (vm.name === 'write' && step.args?.content) {
                        onClickWriteFile?.(step.args.path, step.args.content);
                      }
                    }
                  }}
                >
                  <span className={`tool-step-status ${vm.statusClass}`}>
                    {vm.statusText}
                  </span>
                  <span className="tool-step-name">{vm.name}</span>
                  {vm.completed && vm.output ? (
                    <button
                      aria-label={
                        expandedId === vm.id ? '收起详情' : '展开详情'
                      }
                      className="tool-step-toggle"
                      type="button"
                    >
                      {expandedId === vm.id ? '收起' : '详情'}
                      <span
                        className={`tool-step-chevron ${
                          expandedId === vm.id ? 'open' : ''
                        }`}
                      >
                        ▾
                      </span>
                    </button>
                  ) : null}
                </div>
                {vm.output && expandedId === vm.id ? (
                  <pre
                    className={`tool-step-output ${vm.isError ? 'error' : ''}`}
                  >
                    {vm.output}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

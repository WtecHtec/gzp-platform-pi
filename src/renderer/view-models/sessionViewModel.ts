import type { SessionStatus, SessionSummary } from '../../shared/contracts';

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  drafting: '草稿中',
  formatted: '已排版',
  published: '已发布',
};

export interface SessionItemViewModel {
  id: string;
  title: string;
  statusLabel: string;
  dateLabel: string;
  isActive: boolean;
}

export function toSessionItemViewModel(
  session: SessionSummary,
  activeId: string | undefined,
): SessionItemViewModel {
  return {
    id: session.id,
    title: session.title,
    statusLabel: "",
    dateLabel: new Date(session.updatedAt).toLocaleDateString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
    }),
    isActive: session.id === activeId,
  };
}

import { useState } from 'react';
import type { SessionSummary } from '../../../shared/contracts';
import { toSessionItemViewModel } from '../../view-models/sessionViewModel';
import Icon from './Icon';

export default function SessionSidebar({
  sessions,
  activeId,
  onCreate,
  onDelete,
  onRename,
  onSelect,
  onSettings,
}: {
  sessions: SessionSummary[];
  activeId: string | undefined;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
  onSettings: () => void;
}) {
  const items = sessions.map((s) => toSessionItemViewModel(s, activeId));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const startRename = (id: string, title: string) => {
    setOpenMenuId(null);
    setEditingId(id);
    setEditingTitle(title);
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const commitRename = () => {
    if (!editingId) return;
    const cleanTitle = editingTitle.trim();
    if (cleanTitle) {
      onRename(editingId, cleanTitle);
    }
    cancelRename();
  };

  const deleteSession = (id: string) => {
    setOpenMenuId(null);
    onDelete(id);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">写</span>
        <span>写作台</span>
      </div>
      <button className="new-button" onClick={onCreate} type="button">
        <Icon name="compose" size={16} />
        开始创作
      </button>
      <div className="sidebar-label">最近会话</div>
      <nav className="session-list">
        {items.map((vm) => (
          <div className="session-row-wrap" key={vm.id}>
            {editingId === vm.id ? (
              <input
                aria-label="修改会话名称"
                autoFocus
                className="session-title-input"
                onBlur={commitRename}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                value={editingTitle}
              />
            ) : (
              <button
                className={`session-row ${vm.isActive ? 'active' : ''}`}
                onClick={() => onSelect(vm.id)}
                type="button"
              >
                <span className="session-title">{vm.title}</span>
                <span className="session-meta">
                  {vm.statusLabel}
                  <span>·</span>
                  {vm.dateLabel}
                </span>
              </button>
            )}
            <button
              aria-expanded={openMenuId === vm.id}
              aria-label={`更多操作：${vm.title}`}
              className="session-more"
              onClick={() =>
                setOpenMenuId((cur) => (cur === vm.id ? null : vm.id))
              }
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpenMenuId(null);
              }}
              type="button"
            >
              <Icon name="more" size={15} />
            </button>
            {openMenuId === vm.id ? (
              <div className="session-menu" role="menu">
                <button
                  onClick={() => startRename(vm.id, vm.title)}
                  role="menuitem"
                  type="button"
                >
                  <Icon name="rename" size={14} />
                  修改名称
                </button>
                <button
                  className="danger"
                  onClick={() => deleteSession(vm.id)}
                  role="menuitem"
                  type="button"
                >
                  ×
                  删除会话
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </nav>
      <button className="settings-button" onClick={onSettings} type="button">
        <Icon name="settings" size={17} />
        设置
      </button>
    </aside>
  );
}

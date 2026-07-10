import { FormEvent, useEffect, useState } from 'react';
import type {
  DesktopApi,
  ModelSettings,
  SaveModelSettingsInput,
  WorkspaceSettings,
  SkillDescriptor,
} from '../../../shared/contracts';

type Tab = 'model' | 'storage' | 'skills';

// ---------------------------------------------------------------------------
// Tab 1 — Model configuration
// ---------------------------------------------------------------------------

function ModelTab({
  settings,
  api,
  onSaved,
  onClose,
}: {
  settings: ModelSettings;
  api: DesktopApi;
  onSaved: (settings: ModelSettings) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<SaveModelSettingsInput>({
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: '',
  });
  const [feedback, setFeedback] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const testConnection = async () => {
    setIsBusy(true);
    setFeedback('正在测试连接…');
    const result = await api.settings.testModel(form);
    setFeedback(
      result.ok
        ? `${result.message}${result.latencyMs ? ` · ${result.latencyMs}ms` : ''}`
        : `连接失败：${result.message}`,
    );
    setIsBusy(false);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setIsBusy(true);
    try {
      const saved = await api.settings.saveModel(form);
      onSaved(saved);
      onClose();
    } catch (error) {
      setFeedback(
        `保存失败：${error instanceof Error ? error.message : '未知错误'}`,
      );
      setIsBusy(false);
    }
  };

  return (
    <form aria-label="模型配置" className="settings-tab-form" onSubmit={save}>
      <div className="settings-tab-body">
        <label htmlFor="model-base-url">
          API 地址
          <input
            id="model-base-url"
            onChange={(e) =>
              setForm((cur) => ({ ...cur, baseUrl: e.target.value }))
            }
            placeholder="https://api.openai.com/v1"
            required
            value={form.baseUrl}
          />
        </label>
        <label htmlFor="model-name">
          模型名称
          <input
            id="model-name"
            onChange={(e) =>
              setForm((cur) => ({ ...cur, model: e.target.value }))
            }
            placeholder="gpt-4.1-mini"
            required
            value={form.model}
          />
        </label>
        <label htmlFor="model-api-key">
          API Key
          <input
            autoComplete="off"
            id="model-api-key"
            onChange={(e) =>
              setForm((cur) => ({ ...cur, apiKey: e.target.value }))
            }
            placeholder={
              settings.apiKeyConfigured
                ? '已配置，留空则保持不变'
                : '输入 API Key'
            }
            type="password"
            value={form.apiKey}
          />
        </label>
        <div className="settings-status">
          <span
            className={settings.apiKeyConfigured ? 'configured' : undefined}
          >
            {settings.apiKeyConfigured ? '密钥已配置' : '密钥未配置'}
          </span>
          {feedback ? <p>{feedback}</p> : null}
        </div>
      </div>
      <footer className="settings-tab-footer">
        <button disabled={isBusy} onClick={testConnection} type="button">
          测试连接
        </button>
        <button className="primary" disabled={isBusy} type="submit">
          保存设置
        </button>
      </footer>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — Storage & diagnostics
// ---------------------------------------------------------------------------

function StorageTab({ api }: { api: DesktopApi }) {
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [logDirectory, setLogDirectory] = useState('');
  const [sessionDirectory, setSessionDirectory] = useState('');
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  useEffect(() => {
    api.settings
      .getDiagnostics()
      .then((d) => {
        setLogDirectory(d.logDirectory);
        setSessionDirectory(d.sessionDirectory);
      })
      .catch(() => {
        setLogDirectory('读取失败');
        setSessionDirectory('读取失败');
      });
    api.settings
      .getWorkspace()
      .then(setWorkspace)
      .catch(() => setWorkspace({ directory: '读取失败', skills: [] }));
  }, []);

  const browseWorkspace = async () => {
    const chosen = await api.settings.browseWorkspaceDirectory();
    if (!chosen) return;
    if (!workspace) return;
    setWorkspaceSaving(true);
    try {
      const saved = await api.settings.saveWorkspace({
        directory: chosen,
        skills: workspace.skills,
      });
      setWorkspace(saved);
    } finally {
      setWorkspaceSaving(false);
    }
  };

  return (
    <div className="settings-tab-body">
      <div className="settings-diagnostics">
        <strong>输出文件夹</strong>
        <code>{workspace ? workspace.directory : '正在读取…'}</code>
        <div className="settings-workspace-actions">
          <button
            disabled={workspaceSaving}
            onClick={browseWorkspace}
            type="button"
          >
            浏览…
          </button>
          <button
            onClick={() => api.settings.openWorkspaceDirectory()}
            type="button"
          >
            打开文件夹
          </button>
        </div>
      </div>
      <div className="settings-diagnostics">
        <strong>运行日志</strong>
        <code>{logDirectory || '正在读取…'}</code>
        <button onClick={() => api.settings.openLogDirectory()} type="button">
          打开日志目录
        </button>
      </div>
      <div className="settings-diagnostics">
        <strong>会话数据</strong>
        <code>{sessionDirectory || '正在读取…'}</code>
        <button
          onClick={() => api.settings.openSessionDirectory()}
          type="button"
        >
          打开会话目录
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Skill Management
// ---------------------------------------------------------------------------

function SkillsTab({ api }: { api: DesktopApi }) {
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [customRepoUrl, setCustomRepoUrl] = useState('');
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const loadSkills = async () => {
    try {
      const list = await api.settings.listSkills();
      setSkills(list);
    } catch (err: any) {
      setErrorText('加载技能列表失败：' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const handleInstall = async (repoUrl: string, skillId?: string) => {
    const id = skillId || 'installing';
    setBusySkillId(id);
    setErrorText(null);
    try {
      const res = await api.settings.installSkill({ repoUrl, skillId });
      setLogContent(res.output);
      if (res.success) {
        if (!skillId) setCustomRepoUrl('');
        await loadSkills();
      } else {
        setErrorText('安装失败：\n' + res.output);
      }
    } catch (err: any) {
      setErrorText('操作失败：' + err.message);
    } finally {
      setBusySkillId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm(`确定要删除技能 ${id} 吗？`)) return;
    setBusySkillId(id);
    try {
      await api.settings.removeSkill(id);
      await loadSkills();
    } catch (err: any) {
      setErrorText('删除失败：' + err.message);
    } finally {
      setBusySkillId(null);
    }
  };

  const handleCheckUpdate = async (id: string) => {
    setBusySkillId(id);
    setErrorText(null);
    try {
      const res = await api.settings.checkSkillUpdate(id);
      if (res.updateAvailable) {
        alert(`发现更新！新版本 Commit: ${res.latestCommitHash}\n更新日志:\n${res.changelog || '无'}`);
      } else {
        alert('当前已是最新版本。');
      }
      await loadSkills();
    } catch (err: any) {
      setErrorText('检查更新失败：' + err.message);
    } finally {
      setBusySkillId(null);
    }
  };

  const handleUpdate = async (id: string) => {
    setBusySkillId(id);
    setErrorText(null);
    try {
      const res = await api.settings.updateSkill(id);
      setLogContent(res.output);
      if (res.success) {
        await loadSkills();
      } else {
        setErrorText('更新失败：\n' + res.output);
      }
    } catch (err: any) {
      setErrorText('更新操作发生异常：' + err.message);
    } finally {
      setBusySkillId(null);
    }
  };

  if (loading) {
    return <div className="settings-tab-body">正在加载技能包...</div>;
  }

  return (
    <div className="settings-tab-body" style={{ maxHeight: 'calc(85vh - 160px)', overflowY: 'auto' }}>
      {errorText && (
        <div className="settings-status" style={{ background: '#fff0f0', border: '1px solid #ffcccc', color: '#cc0000', minHeight: 'auto', padding: '10px' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>{errorText}</pre>
        </div>
      )}

      {/* Preset and Custom Skills */}
      <div style={{ display: 'grid', gap: '14px' }}>
        {skills.map((skill) => (
          <div
            key={skill.id}
            className="settings-diagnostics skill-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '16px',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              background: '#fafbf9',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <strong style={{ fontSize: '14px' }}>{skill.name}</strong>
                <span
                  style={{
                    marginLeft: '8px',
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontWeight: 650,
                    background:
                      skill.status === 'ready'
                        ? 'var(--accent-soft)'
                        : skill.status === 'missing_deps'
                        ? '#fff3cd'
                        : skill.status === 'not_installed'
                        ? '#e2e3e5'
                        : '#f8d7da',
                    color:
                      skill.status === 'ready'
                        ? 'var(--accent)'
                        : skill.status === 'missing_deps'
                        ? '#856404'
                        : skill.status === 'not_installed'
                        ? '#383d41'
                        : 'var(--danger)',
                  }}
                >
                  {skill.status === 'ready'
                    ? '已就绪'
                    : skill.status === 'missing_deps'
                    ? '缺少依赖'
                    : skill.status === 'not_installed'
                    ? '未下载'
                    : '发生错误'}
                </span>
                {skill.commitHash && (
                  <code style={{ marginLeft: '8px', background: '#eaeaea', padding: '1px 4px', borderRadius: '3px' }}>
                    {skill.commitHash}
                  </code>
                )}
              </div>
              <div className="skill-card-actions" style={{ display: 'flex', gap: '6px' }}>
                {skill.status === 'not_installed' && (
                  <button
                    disabled={busySkillId !== null}
                    onClick={() => {
                      const presetUrl =
                        skill.id === 'wewrite'
                          ? 'https://github.com/oaker-io/wewrite.git'
                          : 'https://github.com/isjiamu/gzh-design-skill.git';
                      handleInstall(presetUrl, skill.id);
                    }}
                    type="button"
                  >
                    {busySkillId === skill.id ? '正在下载...' : '下载技能'}
                  </button>
                )}

                {skill.status === 'missing_deps' && (
                  <button
                    disabled={busySkillId !== null}
                    onClick={() => handleUpdate(skill.id)}
                    type="button"
                  >
                    {busySkillId === skill.id ? '安装中...' : '安装依赖'}
                  </button>
                )}

                {skill.status !== 'not_installed' && (
                  <>
                    <button
                      disabled={busySkillId !== null}
                      onClick={() => handleCheckUpdate(skill.id)}
                      type="button"
                    >
                      检查更新
                    </button>
                    {skill.status === 'ready' && (
                      <button
                        disabled={busySkillId !== null}
                        onClick={() => handleUpdate(skill.id)}
                        type="button"
                      >
                        更新
                      </button>
                    )}
                    <button
                      onClick={() => api.settings.openSkillDirectory(skill.id)}
                      type="button"
                    >
                      打开目录
                    </button>
                    <button
                      className="danger-outline"
                      disabled={busySkillId !== null}
                      onClick={() => handleRemove(skill.id)}
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      type="button"
                    >
                      删除
                    </button>
                  </>
                )}
              </div>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '12px', lineHeight: '1.4' }}>{skill.description}</div>
            {skill.errorMessage && (
              <div style={{ color: 'var(--danger)', fontSize: '11px', marginTop: '4px' }}>
                {skill.errorMessage}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Install Custom Skill */}
      <div
        className="settings-diagnostics"
        style={{ marginTop: '16px', padding: '16px', background: 'var(--bg)', borderRadius: '8px' }}
      >
        <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
          安装自定义 Skill
        </strong>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            onChange={(e) => setCustomRepoUrl(e.target.value)}
            placeholder="输入 GitHub 仓库 Git URL (e.g. https://github.com/user/repo.git)"
            style={{ flex: 1, height: '34px' }}
            value={customRepoUrl}
          />
          <button
            className="primary"
            disabled={!customRepoUrl.trim() || busySkillId !== null}
            onClick={() => handleInstall(customRepoUrl)}
            style={{
              height: '34px',
              padding: '0 16px',
              background: 'var(--accent)',
              color: '#fff',
              border: 0,
              borderRadius: '6px',
            }}
            type="button"
          >
            {busySkillId === 'installing' ? '安装中...' : '安装'}
          </button>
        </div>
      </div>

      {/* Log Output Detail */}
      {logContent && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px',
            background: '#1e1e1e',
            color: '#d4d4d4',
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: '11px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>执行日志</span>
            <button
              onClick={() => setLogContent(null)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#fff',
                cursor: 'pointer',
                fontSize: '11px',
              }}
              type="button"
            >
              [ 清除 ]
            </button>
          </div>
          <pre style={{ margin: 0, maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
            {logContent}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell — three tabs
// ---------------------------------------------------------------------------

export default function SettingsDialog({
  settings,
  api,
  onClose,
  onSaved,
}: {
  settings: ModelSettings;
  api: DesktopApi;
  onClose: () => void;
  onSaved: (settings: ModelSettings) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>('model');

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="settings-dialog-title"
        className="settings-dialog"
        role="dialog"
      >
        {/* Header */}
        <header className="settings-dialog-header">
          <div>
            <h2 id="settings-dialog-title">设置</h2>
          </div>
          <button
            aria-label="关闭设置"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {/* Tab bar */}
        <div className="settings-tabs" role="tablist">
          <button
            aria-selected={activeTab === 'model'}
            className={`settings-tab-btn ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
            role="tab"
            type="button"
          >
            模型配置
          </button>
          <button
            aria-selected={activeTab === 'storage'}
            className={`settings-tab-btn ${activeTab === 'storage' ? 'active' : ''}`}
            onClick={() => setActiveTab('storage')}
            role="tab"
            type="button"
          >
            存储设置
          </button>
          <button
            aria-selected={activeTab === 'skills'}
            className={`settings-tab-btn ${activeTab === 'skills' ? 'active' : ''}`}
            onClick={() => setActiveTab('skills')}
            role="tab"
            type="button"
          >
            Skill 管理
          </button>
        </div>

        {/* Tab panels */}
        {activeTab === 'model' && (
          <ModelTab
            api={api}
            onClose={onClose}
            onSaved={onSaved}
            settings={settings}
          />
        )}
        {activeTab === 'storage' && <StorageTab api={api} />}
        {activeTab === 'skills' && <SkillsTab api={api} />}
      </div>
    </div>
  );
}

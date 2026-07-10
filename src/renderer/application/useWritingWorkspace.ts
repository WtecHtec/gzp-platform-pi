import { useCallback, useEffect, useState } from 'react';
import {
  DesktopApi,
  ModelSettings,
  SessionSummary,
  WritingSession,
} from '../../shared/contracts';
import createArticleVersion from '../../use-cases/sessions/create-article-version';
import initializeWorkspace from '../../use-cases/sessions/initialize-workspace';
import saveSession from '../../use-cases/sessions/save-session';
import deleteSession from '../../use-cases/sessions/delete-session';

export default function useWritingWorkspace(api: DesktopApi) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<WritingSession>();
  const [modelSettings, setModelSettings] = useState<ModelSettings>();
  const [isLoading, setIsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const refreshSessions = useCallback(async () => {
    setSessions(await api.sessions.list());
  }, [api]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSession() {
      const workspace = await initializeWorkspace(api.sessions);
      if (!cancelled) {
        setSessions(workspace.sessions);
        setActiveSession(workspace.activeSession);
        setIsLoading(false);
      }
    }

    loadInitialSession();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const createSession = async () => {
    const created = await api.sessions.create();
    setActiveSession(created);
    setPreviewOpen(false);
    await refreshSessions();
  };

  const selectSession = async (sessionId: string) => {
    setActiveSession(await api.sessions.load(sessionId));
    setPreviewOpen(false);
  };

  const renameSession = async (sessionId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    const renamed = await api.sessions.rename({ sessionId, title: cleanTitle });
    setSessions((cur) =>
      cur.map((item) => (item.id === sessionId ? renamed : item)),
    );
    setActiveSession((cur) =>
      cur && cur.id === sessionId ? { ...cur, title: cleanTitle } : cur,
    );
  };

  const removeSession = async (sessionId: string) => {
    const workspace = await deleteSession(sessionId, api.sessions);
    setSessions(workspace.sessions);
    setActiveSession(workspace.activeSession);
    setPreviewOpen(false);
  };

  const updateSession = useCallback(
    async (session: WritingSession) => {
      // 先做乐观更新，再以主进程原子落盘后的数据为准。
      setActiveSession(session);
      const saved = await saveSession(session, api.sessions);
      setActiveSession(saved.session);
      setSessions(saved.sessions);
    },
    [api],
  );

  const saveVersion = async (title: string, markdown: string) => {
    if (!activeSession) return;
    await updateSession(createArticleVersion(activeSession, title, markdown));
  };

  const selectVersion = async (activeVersionId: string) => {
    if (!activeSession) return;
    await updateSession({ ...activeSession, activeVersionId });
  };

  const openSettings = async () => {
    setModelSettings(await api.settings.getModel());
    setSettingsOpen(true);
  };

  return {
    activeSession,
    closePreview: () => setPreviewOpen(false),
    closeSettings: () => setSettingsOpen(false),
    createSession,
    isLoading,
    modelSettings,
    openPreview: () => setPreviewOpen(true),
    openSettings,
    previewOpen,
    renameSession,
    removeSession,
    saveVersion,
    selectSession,
    selectVersion,
    sessions,
    settingsOpen,
    setModelSettings,
    updateSession,
  };
}

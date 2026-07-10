import useWritingWorkspace from './application/useWritingWorkspace';
import { createBrowserApi } from './application/browserMockApi';
import SessionSidebar from './ui/components/SessionSidebar';
import ConversationPage from './ui/pages/ConversationPage';
import PreviewPage from './ui/pages/PreviewPage';
import SettingsDialog from './ui/pages/SettingsDialog';
import './App.css';

const api = window.desktopApi || createBrowserApi();

export default function App() {
  const workspace = useWritingWorkspace(api);

  if (workspace.isLoading || !workspace.activeSession) {
    return <div className="app-shell app-loading">正在打开写作台…</div>;
  }

  const { activeSession } = workspace;

  return (
    <div className={`app-shell ${workspace.previewOpen ? 'with-preview' : ''}`}>
      <SessionSidebar
        activeId={activeSession.id}
        onCreate={workspace.createSession}
        onDelete={workspace.removeSession}
        onRename={workspace.renameSession}
        onSelect={workspace.selectSession}
        onSettings={workspace.openSettings}
        sessions={workspace.sessions}
      />
      <ConversationPage
        api={api}
        onOpenPreview={workspace.openPreview}
        onUpdate={workspace.updateSession}
        session={activeSession}
      />
      {workspace.previewOpen ? (
        <PreviewPage
          api={api}
          onClose={workspace.closePreview}
          onVersionChange={workspace.selectVersion}
          session={activeSession}
        />
      ) : null}
      {workspace.settingsOpen && workspace.modelSettings ? (
        <SettingsDialog
          api={api}
          onClose={workspace.closeSettings}
          onSaved={workspace.setModelSettings}
          settings={workspace.modelSettings}
        />
      ) : null}
    </div>
  );
}

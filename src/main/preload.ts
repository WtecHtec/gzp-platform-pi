import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import {
  AgentEvent,
  CreateSessionInput,
  DeleteSessionInput,
  DesktopApi,
  ExportHtmlInput,
  RenameSessionInput,
  SaveModelSettingsInput,
  SaveSessionInput,
  SaveWorkspaceSettingsInput,
  SaveSearchSettingsInput,
} from '../shared/contracts';

const desktopApi: DesktopApi = {
  sessions: {
    list: () => ipcRenderer.invoke('session:list'),
    create: (input?: CreateSessionInput) =>
      ipcRenderer.invoke('session:create', input),
    load: (sessionId: string) => ipcRenderer.invoke('session:load', sessionId),
    save: (input: SaveSessionInput) =>
      ipcRenderer.invoke('session:save', input),
    rename: (input: RenameSessionInput) =>
      ipcRenderer.invoke('session:rename', input),
    delete: (input: DeleteSessionInput) =>
      ipcRenderer.invoke('session:delete', input),
  },
  settings: {
    getModel: () => ipcRenderer.invoke('settings:model:get'),
    saveModel: (input: SaveModelSettingsInput) =>
      ipcRenderer.invoke('settings:model:save', input),
    testModel: (input: SaveModelSettingsInput) =>
      ipcRenderer.invoke('settings:model:test', input),
    getDiagnostics: () => ipcRenderer.invoke('settings:diagnostics:get'),
    openLogDirectory: () => ipcRenderer.invoke('settings:logs:open'),
    openSessionDirectory: () => ipcRenderer.invoke('settings:sessions:open'),
    getWorkspace: () => ipcRenderer.invoke('settings:workspace:get'),
    saveWorkspace: (input: SaveWorkspaceSettingsInput) =>
      ipcRenderer.invoke('settings:workspace:save', input),
    openWorkspaceDirectory: () => ipcRenderer.invoke('settings:workspace:open'),
    browseWorkspaceDirectory: () =>
      ipcRenderer.invoke('settings:workspace:browse'),
    listSkills: () => ipcRenderer.invoke('settings:skills:list'),
    getSkillContent: (skillId: string, section?: string) =>
      ipcRenderer.invoke('settings:skills:get-content', skillId, section),
    installSkill: (input: any) =>
      ipcRenderer.invoke('settings:skills:install', input),
    removeSkill: (skillId: string) =>
      ipcRenderer.invoke('settings:skills:remove', skillId),
    checkSkillUpdate: (skillId: string) =>
      ipcRenderer.invoke('settings:skills:check-update', skillId),
    updateSkill: (skillId: string) =>
      ipcRenderer.invoke('settings:skills:update', skillId),
    openSkillDirectory: (skillId: string) =>
      ipcRenderer.invoke('settings:skills:open-dir', skillId),
    getSearch: () => ipcRenderer.invoke('settings:search:get'),
    saveSearch: (input: SaveSearchSettingsInput) =>
      ipcRenderer.invoke('settings:search:save', input),
    testSearch: (provider: 'tavily' | 'brave', apiKey: string) =>
      ipcRenderer.invoke('settings:search:test', provider, apiKey),
  },
  agent: {
    run: (input) => ipcRenderer.invoke('agent:run', input),
    cancel: (runId) => ipcRenderer.invoke('agent:cancel', runId),
    onEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, agentEvent: AgentEvent) =>
        listener(agentEvent);
      ipcRenderer.on('agent:event', handler);
      return () => ipcRenderer.removeListener('agent:event', handler);
    },
  },
  layout: {
    exportHtml: (input: ExportHtmlInput) =>
      ipcRenderer.invoke('layout:export', input),
  },
  files: {
    openWorkspaceFile: (fileName: string) =>
      ipcRenderer.invoke('file:workspace:open', fileName),
    saveToWorkspace: (fileName: string, content: string) =>
      ipcRenderer.invoke('file:workspace:save', fileName, content),
    readFile: (filePath: string) =>
      ipcRenderer.invoke('file:read', filePath),
  },
  openExternalUrl: (url: string) => ipcRenderer.invoke('external:open', url),
};

contextBridge.exposeInMainWorld('desktopApi', desktopApi);

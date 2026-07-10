/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { promises as fs } from 'fs';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import SessionStore from './session-store';
import {
  AgentEvent,
  AgentRunInput,
  DeleteSessionInput,
  ExportHtmlInput,
  RenameSessionInput,
  SaveModelSettingsInput,
  SaveSessionInput,
  SaveWorkspaceSettingsInput,
} from '../shared/contracts';
import ModelSettingsStore from './model-settings-store';
import WorkspaceSettingsStore from './workspace-settings-store';
import PiAgentRuntime from './agent-runtime';
import checkWritingIntent from './intent-gate';
import createBasicTools from './tools';
import createAppLogger, { resolveLogDirectory } from './logger';
import SkillManager from './skills/skill-manager';
import compactToolResults from './context/compact-tool-results';
import ConversationHistoryCompactor from './context/conversation-history-compactor';
import ModelContextSummarizer from './context/context-summarizer';
import { defaultContextCompactionConfig } from './context/context-config';
import TokenEstimator from './context/token-estimator';
import ToolOutputCompactor from './context/tool-output-compactor';
import WorkspaceToolOutputArchive from './context/tool-output-archive';
import SessionProfileStore from './memory/session-profile-store';
import createUpdateProfileTool from './memory/update-profile-tool';
import buildSkillPrompt from './skills/skill-prompt';

const logDirectory = resolveLogDirectory(app.getPath('userData'));
const logger = createAppLogger(logDirectory);
const skillManager = new SkillManager(app.getPath('userData'), logger);
const profileStore = new SessionProfileStore(app.getPath('userData'));

class AppUpdater {
  constructor() {
    autoUpdater.logger = logger;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let sessionStore: SessionStore;
let modelSettingsStore: ModelSettingsStore;
let workspaceSettingsStore: WorkspaceSettingsStore;
const activeRuns = new Map<string, AbortController>();

// Dynamic workspace root resolver — reads the latest configured directory each time a tool runs.
const workspaceRootFn = async (): Promise<string> => {
  const config = await workspaceSettingsStore.get();
  await fs.mkdir(config.directory, { recursive: true });
  return config.directory;
};

const piAgentRuntime = new PiAgentRuntime(
  (sessionId) =>
    compactToolResults(
      [
        ...createBasicTools(workspaceRootFn, logger, skillManager),
        createUpdateProfileTool(sessionId, profileStore),
      ],
      new ToolOutputCompactor(
        new WorkspaceToolOutputArchive(workspaceRootFn),
        defaultContextCompactionConfig,
      ),
    ),
  async () => buildSkillPrompt(await skillManager.listSkills()),
  new ConversationHistoryCompactor(
    new TokenEstimator(),
    new ModelContextSummarizer(defaultContextCompactionConfig),
    defaultContextCompactionConfig,
  ),
  profileStore,
  logger,
);

function registerIpcHandlers(
  store: SessionStore,
  settings: ModelSettingsStore,
  workspaceSettings: WorkspaceSettingsStore,
) {
  ipcMain.handle('session:list', () => store.list());
  ipcMain.handle('session:create', (_event, input) => store.create(input));
  ipcMain.handle('session:load', (_event, sessionId: string) =>
    store.load(sessionId),
  );
  ipcMain.handle('session:save', (_event, input: SaveSessionInput) =>
    store.save(input.session),
  );
  ipcMain.handle('session:rename', (_event, input: RenameSessionInput) =>
    store.rename(input.sessionId, input.title),
  );
  ipcMain.handle('session:delete', (_event, input: DeleteSessionInput) =>
    Promise.all([
      store.delete(input.sessionId),
      Promise.resolve(piAgentRuntime.deleteSession(input.sessionId)),
    ]).then(() => undefined),
  );
  ipcMain.handle('settings:model:get', () => settings.get());
  ipcMain.handle('settings:diagnostics:get', async () => {
    const wsConfig = await workspaceSettings.get();
    return {
      logDirectory,
      sessionDirectory: store.directory,
      workspaceDirectory: wsConfig.directory,
    };
  });
  ipcMain.handle('settings:logs:open', async () => {
    await fs.mkdir(logDirectory, { recursive: true });
    const errorMessage = await shell.openPath(logDirectory);
    if (errorMessage)
      throw new Error(`OPEN_LOG_DIRECTORY_FAILED:${errorMessage}`);
  });
  ipcMain.handle('settings:sessions:open', async () => {
    await store.initialize();
    const errorMessage = await shell.openPath(store.directory);
    if (errorMessage) {
      throw new Error(`OPEN_SESSION_DIRECTORY_FAILED:${errorMessage}`);
    }
  });
  ipcMain.handle('settings:workspace:get', () => workspaceSettings.get());
  ipcMain.handle(
    'settings:workspace:save',
    (_event, input: SaveWorkspaceSettingsInput) =>
      workspaceSettings.save(input.directory, input.skills),
  );
  ipcMain.handle('settings:workspace:open', async () => {
    const config = await workspaceSettings.get();
    await fs.mkdir(config.directory, { recursive: true });
    const errorMessage = await shell.openPath(config.directory);
    if (errorMessage) {
      throw new Error(`OPEN_WORKSPACE_DIRECTORY_FAILED:${errorMessage}`);
    }
  });
  ipcMain.handle('settings:workspace:browse', async () => {
    const config = await workspaceSettings.get();
    const result = await dialog.showOpenDialog({
      title: '选择输出文件夹',
      defaultPath: config.directory,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('settings:skills:list', () => skillManager.listSkills());
  ipcMain.handle('settings:skills:get-content', (_event, skillId: string, section?: string) =>
    skillManager.getSkillContent(skillId, section),
  );
  ipcMain.handle('settings:skills:install', (_event, input: any) =>
    skillManager.installSkill(input),
  );
  ipcMain.handle('settings:skills:remove', (_event, skillId: string) =>
    skillManager.removeSkill(skillId),
  );
  ipcMain.handle('settings:skills:check-update', (_event, skillId: string) =>
    skillManager.checkSkillUpdate(skillId),
  );
  ipcMain.handle('settings:skills:update', (_event, skillId: string) =>
    skillManager.updateSkill(skillId),
  );
  ipcMain.handle('settings:skills:open-dir', (_event, skillId: string) =>
    skillManager.openSkillDirectory(skillId),
  );
  ipcMain.handle(
    'settings:model:save',
    (_event, input: SaveModelSettingsInput) => settings.save(input),
  );
  ipcMain.handle(
    'settings:model:test',
    async (_event, input: SaveModelSettingsInput) => {
      const startedAt = Date.now();
      try {
        const config = await settings.resolve(input);
        const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (config.apiKey) {
          headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text();
          let errorDetail = '';
          try {
            const parsed = JSON.parse(body);
            errorDetail = parsed.error?.message || parsed.message || body;
          } catch {
            errorDetail = body;
          }
          throw new Error(`HTTP ${response.status}: ${errorDetail}`);
        }

        return {
          ok: true,
          message: '连接成功',
          latencyMs: Date.now() - startedAt,
        };
      } catch (error) {
        let msg = '连接失败';
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            msg = '连接超时 (10秒)';
          } else {
            msg = error.message;
          }
        }
        return {
          ok: false,
          message: msg,
        };
      }
    },
  );
  ipcMain.handle('agent:run', async (event, input: AgentRunInput) => {
    const decision = checkWritingIntent(input.prompt, input.mode === 'draft');
    if (!decision.allowed) {
      throw new Error(`INTENT_REJECTED:${decision.reason}`);
    }
    if (activeRuns.has(input.runId)) throw new Error('RUN_ALREADY_EXISTS');
    const controller = new AbortController();
    activeRuns.set(input.runId, controller);
    logger.info('agent.run.started', {
      runId: input.runId,
      sessionId: input.sessionId,
      mode: input.mode,
    });
    const emit = (agentEvent: AgentEvent) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('agent:event', agentEvent);
      }
    };
    emit({
      runId: input.runId,
      sessionId: input.sessionId,
      type: 'started',
    });
    try {
      const config = await settings.resolve();
      if (!config.apiKey) {
        throw new Error('MODEL_API_KEY_MISSING');
      }
      const result = await piAgentRuntime.run(
        config,
        input,
        controller.signal,
        (delta) =>
          emit({
            runId: input.runId,
            sessionId: input.sessionId,
            type: 'delta',
            delta,
          }),
        (delta) =>
          emit({
            runId: input.runId,
            sessionId: input.sessionId,
            type: 'thinking-delta',
            delta,
          }),
        (toolEvent) =>
          emit({
            ...toolEvent,
            runId: input.runId,
            sessionId: input.sessionId,
          }),
      );
      emit({
        runId: input.runId,
        sessionId: input.sessionId,
        type: 'completed',
      });
      logger.info('agent.run.completed', {
        runId: input.runId,
        sessionId: input.sessionId,
        mode: input.mode,
      });
      return result;
    } catch (error) {
      logger.error('agent.run.failed', {
        runId: input.runId,
        sessionId: input.sessionId,
        mode: input.mode,
        error,
      });
      if (controller.signal.aborted) {
        emit({
          runId: input.runId,
          sessionId: input.sessionId,
          type: 'cancelled',
        });
        throw new Error('AGENT_CANCELLED');
      }
      throw error;
    } finally {
      activeRuns.delete(input.runId);
    }
  });
  ipcMain.handle('agent:cancel', (_event, runId: string) => {
    activeRuns.get(runId)?.abort();
  });
  ipcMain.handle('layout:export', async (_event, input: ExportHtmlInput) => {
    const safeTitle =
      input.title.replace(/[\\/:*?"<>|]/g, '-').trim() || '公众号文章';
    const result = await dialog.showSaveDialog({
      title: '导出公众号 HTML',
      defaultPath: `${safeTitle}_排版_石墨极简风(graphite-minimal).html`,
      filters: [{ name: 'HTML', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return { cancelled: true };
    await fs.writeFile(result.filePath, input.html, 'utf8');
    return { cancelled: false, filePath: result.filePath };
  });
  ipcMain.handle('file:workspace:open', async (_event, fileName: string) => {
    const config = await workspaceSettings.get();
    const baseName = path.basename(fileName);
    const targetPath = path.join(config.directory, baseName);
    const errorMessage = await shell.openPath(targetPath);
    if (errorMessage) {
      throw new Error(`OPEN_WORKSPACE_FILE_FAILED:${errorMessage}`);
    }
  });
  ipcMain.handle(
    'file:workspace:save',
    async (_event, fileName: string, content: string) => {
      const config = await workspaceSettings.get();
      const safe = path.basename(fileName).replace(/[/\\:*?"<>|]/g, '_');
      const targetPath = path.join(config.directory, safe);
      await fs.writeFile(targetPath, content, 'utf8');
      return targetPath;
    },
  );
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  });

  ipcMain.handle('external:open', async (_event, url: string) => {
    let targetUrl = url;
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
    }
    try {
      await shell.openExternal(targetUrl);
    } catch (err) {
      logger.error('external:open.failed', { url, targetUrl, error: err });
    }
  });
}

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.webContents.on('did-finish-load', async () => {
    const bridgeReady = await mainWindow?.webContents.executeJavaScript(
      "typeof window.desktopApi === 'object'",
    );
    if (!bridgeReady) {
      logger.error('preload.bridge.failed');
    }
  });

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(async () => {
    sessionStore = new SessionStore(app.getPath('userData'));
    modelSettingsStore = new ModelSettingsStore(app.getPath('userData'));
    workspaceSettingsStore = new WorkspaceSettingsStore(
      app.getPath('userData'),
    );
    await sessionStore.initialize();
    registerIpcHandlers(
      sessionStore,
      modelSettingsStore,
      workspaceSettingsStore,
    );
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

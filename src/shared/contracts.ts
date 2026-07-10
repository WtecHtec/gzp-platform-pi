export type SessionStatus = 'drafting' | 'formatted' | 'published';

export type ChatRole = 'user' | 'assistant';

export type MessageKind = 'text' | 'topics' | 'step';

export interface TopicOption {
  id: string;
  title: string;
  audience: string;
  angle: string;
}

export interface ToolStep {
  id: string;
  name: string;
  completed: boolean;
  isError: boolean;
  output?: string;
  args?: any;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  kind: MessageKind;
  content: string;
  thinkingContent?: string;
  createdAt: string;
  topics?: TopicOption[];
  toolSteps?: ToolStep[];
  isError?: boolean;
}

export interface ArticleVersion {
  id: string;
  label: string;
  title: string;
  markdown: string;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  updatedAt: string;
}

export interface WritingSession extends SessionSummary {
  messages: ChatMessage[];
  versions: ArticleVersion[];
  activeVersionId?: string;
}

export interface CreateSessionInput {
  title?: string;
}

export interface RenameSessionInput {
  sessionId: string;
  title: string;
}

export interface DeleteSessionInput {
  sessionId: string;
}

export interface SaveSessionInput {
  session: WritingSession;
}

export interface ModelSettings {
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
}

export interface SaveModelSettingsInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export interface DiagnosticsInfo {
  logDirectory: string;
  sessionDirectory: string;
  workspaceDirectory: string;
}

export interface WorkspaceSettings {
  directory: string;
  skills: string[];
}

export interface SaveWorkspaceSettingsInput {
  directory: string;
  skills: string[];
}

export type SkillStatus = 'ready' | 'missing_deps' | 'not_installed' | 'error';

export interface SkillDescriptor {
  /** Unique identifier, matches the directory name */
  id: string;
  /** Human-readable display name from SKILL.md frontmatter */
  name: string;
  /** One-line description from SKILL.md frontmatter */
  description: string;
  /** Absolute path to the skill directory */
  path: string;
  /** Installation/readiness status */
  status: SkillStatus;
  /** Locked commit hash (if installed via git) */
  commitHash?: string;
  /** Available remote commit hash when an update is detected */
  latestCommitHash?: string;
  /** Whether a newer version is available on the remote */
  updateAvailable?: boolean;
  /** Error detail when status === 'error' */
  errorMessage?: string;
}

export interface InstallSkillInput {
  repoUrl: string;
  /** Optional target directory name override */
  skillId?: string;
}

export interface InstallSkillResult {
  success: boolean;
  skillId: string;
  output: string;
}

export interface CheckSkillUpdateResult {
  skillId: string;
  updateAvailable: boolean;
  latestCommitHash?: string;
  currentCommitHash?: string;
  changelog?: string;
}

export interface UpdateSkillResult {
  success: boolean;
  skillId: string;
  output: string;
}

export type AgentRunMode = 'topics' | 'draft';

export interface AgentRunInput {
  runId: string;
  sessionId: string;
  mode?: AgentRunMode;
  prompt: string;
  topic?: TopicOption;
  history?: ChatMessage[];
}

export interface AgentEvent {
  runId: string;
  sessionId: string;
  type:
    | 'started'
    | 'delta'
    | 'thinking-delta'
    | 'tool-started'
    | 'tool-completed'
    | 'cancelled'
    | 'completed';
  delta?: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  toolOutput?: string;
  args?: any;
}

export interface AgentRunResult {
  message: string;
  topics?: TopicOption[];
  article?: {
    title: string;
    markdown: string;
  };
}

export interface LayoutResult {
  html: string;
  theme: 'graphite-minimal';
  themeName: '石墨极简风';
  errors: string[];
  warnings: string[];
}

export interface ExportHtmlInput {
  title: string;
  html: string;
}

export interface ExportHtmlResult {
  cancelled: boolean;
  filePath?: string;
}

export interface DesktopApi {
  sessions: {
    list(): Promise<SessionSummary[]>;
    create(input?: CreateSessionInput): Promise<WritingSession>;
    load(sessionId: string): Promise<WritingSession>;
    save(input: SaveSessionInput): Promise<WritingSession>;
    rename(input: RenameSessionInput): Promise<SessionSummary>;
    delete(input: DeleteSessionInput): Promise<void>;
  };
  settings: {
    getModel(): Promise<ModelSettings>;
    saveModel(input: SaveModelSettingsInput): Promise<ModelSettings>;
    testModel(input: SaveModelSettingsInput): Promise<ConnectionTestResult>;
    getDiagnostics(): Promise<DiagnosticsInfo>;
    openLogDirectory(): Promise<void>;
    openSessionDirectory(): Promise<void>;
    getWorkspace(): Promise<WorkspaceSettings>;
    saveWorkspace(
      input: SaveWorkspaceSettingsInput,
    ): Promise<WorkspaceSettings>;
    openWorkspaceDirectory(): Promise<void>;
    browseWorkspaceDirectory(): Promise<string | null>;
    listSkills(): Promise<SkillDescriptor[]>;
    getSkillContent(skillId: string, section?: string): Promise<string>;
    installSkill(input: InstallSkillInput): Promise<InstallSkillResult>;
    removeSkill(skillId: string): Promise<void>;
    checkSkillUpdate(skillId: string): Promise<CheckSkillUpdateResult>;
    updateSkill(skillId: string): Promise<UpdateSkillResult>;
    openSkillDirectory(skillId: string): Promise<void>;
    getSearch(): Promise<SearchSettings>;
    saveSearch(input: SaveSearchSettingsInput): Promise<SearchSettings>;
    testSearch(provider: 'tavily' | 'brave', apiKey: string): Promise<ConnectionTestResult>;
  };
  agent: {
    run(input: AgentRunInput): Promise<AgentRunResult>;
    cancel(runId: string): Promise<void>;
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
  layout: {
    exportHtml(input: ExportHtmlInput): Promise<ExportHtmlResult>;
  };
  files: {
    openWorkspaceFile(fileName: string): Promise<void>;
    /** Save raw text to a file in the workspace directory and return its path. */
    saveToWorkspace(fileName: string, content: string): Promise<string>;
    /** Read a file from any path on disk and return its text content. */
    readFile(filePath: string): Promise<string>;
  };
  openExternalUrl(url: string): Promise<void>;
}

export interface SearchSettings {
  tavilyApiKeyConfigured: boolean;
  braveApiKeyConfigured: boolean;
}

export interface SaveSearchSettingsInput {
  tavilyApiKey?: string;
  braveApiKey?: string;
}


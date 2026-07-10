import type {
  DesktopApi,
  WritingSession,
  TopicOption,
  ArticleVersion,
  ChatMessage,
} from '../../shared/contracts';

const topics: TopicOption[] = [
  {
    id: 'topic-1',
    title: 'AI Agent 落地，真正难的不是模型',
    audience: '正在评估 Agent 项目的产品 and 技术负责人',
    angle: '从工作流、上下文与组织协作三个被低估的难点切入',
  },
  {
    id: 'topic-2',
    title: '我们为什么高估了 Agent 的自主性',
    audience: '关注 AI 应用趋势的从业者',
    angle: '拆解“全自动”叙事，强调可控边界与人机协作',
  },
  {
    id: 'topic-3',
    title: '从 Demo 到生产：Agent 团队踩过的五个坑',
    audience: '准备启动 Agent 项目的创业团队',
    angle: '以复盘清单呈现工程化与商业化的真实代价',
  },
];

const seedVersions: ArticleVersion[] = [
  {
    id: 'version-1',
    label: 'agent-draft.md',
    title: 'agent-draft.md',
    createdAt: new Date().toISOString(),
    markdown: `很多团队第一次做 AI Agent，注意力都放在模型能力上。

但项目真正进入生产环境后，最先暴露的往往不是模型不够聪明，而是三个更朴素的问题：工作流是否清楚、上下文是否可信、组织是否准备好接住它。

## 一、Agent 不是更长的提示词

一个能稳定工作的 Agent，本质上是一套可观测、可中断、可恢复的业务流程。模型只是其中的决策组件。

## 二、上下文决定输出上限

没有可靠的数据边界、版本记录和来源追踪，模型越主动，风险反而越大。

## 三、先设计协作，再讨论自治

真正值得追求的不是“没有人参与”，而是让人只在高价值节点做判断。`,
  },
];

const seedMessages: ChatMessage[] = [
  {
    id: 'message-1',
    role: 'user',
    kind: 'text',
    content: '帮我写一篇关于 AI Agent 落地难点的公众号文章。',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'message-2',
    role: 'assistant',
    kind: 'step',
    content: '已分析目标读者与选题空间',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'message-3',
    role: 'assistant',
    kind: 'topics',
    content:
      '我整理了三个方向。第一个更适合做行业判断，观点集中，也更容易引发转发。',
    topics,
    createdAt: new Date().toISOString(),
  },
];

function createSeedSession(): WritingSession {
  return {
    id: 'demo-session',
    title: 'AI Agent 落地难点',
    status: 'drafting',
    updatedAt: new Date().toISOString(),
    messages: seedMessages,
    versions: seedVersions,
    activeVersionId: 'version-1',
  };
}

export function createBrowserApi(): DesktopApi {
  let sessions = [createSeedSession()];
  const agentListeners = new Set<
    Parameters<DesktopApi['agent']['onEvent']>[0]
  >();
  const emitAgentEvent = (
    event: Parameters<Parameters<DesktopApi['agent']['onEvent']>[0]>[0],
  ) => agentListeners.forEach((listener) => listener(event));
  return {
    sessions: {
      async list() {
        return sessions.map(({ id, title, status, updatedAt }) => ({
          id,
          title,
          status,
          updatedAt,
        }));
      },
      async create(input) {
        const now = new Date().toISOString();
        const session: WritingSession = {
          id: `browser-${Date.now()}`,
          title: input?.title || '未命名文章',
          status: 'drafting',
          updatedAt: now,
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              kind: 'text',
              content: '告诉我你想写的主题，我会先帮你确定选题方向。',
              createdAt: now,
            },
          ],
          versions: [],
        };
        sessions = [session, ...sessions];
        return session;
      },
      async load(sessionId) {
        const session = sessions.find((item) => item.id === sessionId);
        if (!session) throw new Error('SESSION_NOT_FOUND');
        return session;
      },
      async save(input) {
        const saved = { ...input.session, updatedAt: new Date().toISOString() };
        sessions = sessions.map((item) =>
          item.id === saved.id ? saved : item,
        );
        return saved;
      },
      async rename(input) {
        const session = sessions.find((item) => item.id === input.sessionId);
        if (!session) throw new Error('SESSION_NOT_FOUND');
        session.title = input.title;
        return session;
      },
      async delete(input) {
        sessions = sessions.filter((item) => item.id !== input.sessionId);
      },
    },
    settings: {
      async getModel() {
        return {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4.1-mini',
          apiKeyConfigured: false,
        };
      },
      async saveModel(input) {
        return {
          baseUrl: input.baseUrl,
          model: input.model,
          apiKeyConfigured: Boolean(input.apiKey),
        };
      },
      async testModel() {
        return { ok: true, message: '演示模式连接成功', latencyMs: 120 };
      },
      async getDiagnostics() {
        return {
          logDirectory: '浏览器演示模式不写入日志文件',
          sessionDirectory: '浏览器演示模式使用内存会话',
          workspaceDirectory: '浏览器演示模式',
        };
      },
      async openLogDirectory() {
        return undefined;
      },
      async openSessionDirectory() {
        return undefined;
      },
      async getWorkspace() {
        return {
          directory: '~/Documents/gzh-platform（演示模式）',
          skills: [],
        };
      },
      async saveWorkspace(input) {
        return { directory: input.directory, skills: input.skills };
      },
      async openWorkspaceDirectory() {
        return undefined;
      },
      async browseWorkspaceDirectory() {
        return null;
      },
      async listSkills() {
        return [
          {
            id: 'wewrite',
            name: 'wewrite',
            description: '（浏览器演示）公众号文章全流程创作(热点抓取/选题/写作框架/素材采集/SEO优化/配图/排版/发布/效果复盘)',
            path: '/mock/skills/wewrite',
            status: 'ready',
            commitHash: 'a7b3c2d',
          },
          {
            id: 'gzh-design',
            name: 'gzh-design',
            description: '（浏览器演示）将已有 Markdown 正文排版为可直接粘贴到微信公众号编辑器的精致 HTML',
            path: '/mock/skills/gzh-design',
            status: 'not_installed',
          }
        ];
      },
      async getSkillContent(skillId: string, section?: string) {
        return `# Mock Skill Content for ${skillId}\nSection: ${section || 'SKILL.md'}`;
      },
      async installSkill(input: any) {
        return {
          success: true,
          skillId: input.skillId || 'mock-installed-skill',
          output: 'Mock skill successfully cloned and installed dependencies.',
        };
      },
      async removeSkill() {},
      async checkSkillUpdate(skillId: string) {
        return {
          skillId,
          updateAvailable: true,
          currentCommitHash: 'a7b3c2d',
          latestCommitHash: 'f9c8d7e',
          changelog: '1. Add new prompts\n2. Fix markdown parser bug',
        };
      },
      async updateSkill(skillId: string) {
        return {
          success: true,
          skillId,
          output: 'Mock skill successfully updated.',
        };
      },
      async openSkillDirectory() {},
    },
    agent: {
      async run(input) {
        emitAgentEvent({
          runId: input.runId,
          sessionId: input.sessionId,
          type: 'started',
        });
        if (input.prompt.startsWith('选择方向：')) {
          emitAgentEvent({
            runId: input.runId,
            sessionId: input.sessionId,
            type: 'delta',
            delta: seedVersions[0].markdown,
          });
          emitAgentEvent({
            runId: input.runId,
            sessionId: input.sessionId,
            type: 'completed',
          });
          return {
            message: seedVersions[0].markdown,
            article: {
              title: input.prompt.replace('选择方向：', ''),
              markdown: seedVersions[0].markdown,
            },
          };
        }

        emitAgentEvent({
          runId: input.runId,
          sessionId: input.sessionId,
          type: 'completed',
        });
        return {
          message: '我先把这个主题拆成三个可写的方向，你可以选一个继续。',
          topics,
        };
      },
      async cancel(runId) {
        emitAgentEvent({
          runId,
          sessionId: '',
          type: 'cancelled',
        });
      },
      onEvent(listener) {
        agentListeners.add(listener);
        return () => agentListeners.delete(listener);
      },
    },
    layout: {
      async exportHtml() {
        return { cancelled: false, filePath: '浏览器演示模式' };
      },
    },
    files: {
      async openWorkspaceFile() {},
      async saveToWorkspace(fileName: string, _content: string) {
        return `/workspace/${fileName}`;
      },
      async readFile(_filePath: string) {
        return '';
      },
    },
    async openExternalUrl(url) {
      window.open(url, '_blank');
    },
  };
}

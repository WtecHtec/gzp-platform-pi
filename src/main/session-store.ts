import { promises as fs } from 'fs';
import path from 'path';
import {
  CreateSessionInput,
  SessionSummary,
  WritingSession,
} from '../shared/contracts';
import SessionProfileStore from './memory/session-profile-store';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptySession(input: CreateSessionInput = {}): WritingSession {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: input.title?.trim() || '未命名文章',
    status: 'drafting',
    updatedAt: now,
    messages: [
      {
        id: newId(),
        role: 'assistant',
        kind: 'text',
        content:
          '告诉我你想写的主题、目标读者，或者直接粘贴已有素材。我会先帮你确定选题方向。',
        createdAt: now,
      },
    ],
    versions: [],
  };
}

export default class SessionStore {
  private readonly sessionsDir: string;

  private readonly profileStore: SessionProfileStore;

  private readonly saveQueues = new Map<string, Promise<WritingSession>>();

  constructor(userDataPath: string) {
    this.sessionsDir = path.join(userDataPath, 'sessions');
    this.profileStore = new SessionProfileStore(userDataPath);
  }

  get directory(): string {
    return this.sessionsDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  private sessionDirectory(sessionId: string): string {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error('INVALID_SESSION_ID');
    }
    return path.join(this.sessionsDir, sessionId);
  }

  private sessionPath(sessionId: string): string {
    return path.join(this.sessionDirectory(sessionId), 'session.json');
  }

  private messagesPath(sessionId: string): string {
    return path.join(this.sessionDirectory(sessionId), 'messages.jsonl');
  }

  private async writeMessagesJsonl(session: WritingSession): Promise<void> {
    const content = session.messages
      .map((message) => JSON.stringify(message))
      .join('\n');
    await fs.writeFile(
      this.messagesPath(session.id),
      content ? `${content}\n` : '',
      'utf8',
    );
  }

  async list(): Promise<SessionSummary[]> {
    await this.initialize();
    const files = await fs.readdir(this.sessionsDir, { withFileTypes: true });
    const sessions = await Promise.all(
      files
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            const raw = await fs.readFile(
              path.join(this.sessionsDir, entry.name, 'session.json'),
              'utf8',
            );
            const session = JSON.parse(raw) as Partial<WritingSession>;
            if (
              !session.id ||
              !SESSION_ID_PATTERN.test(session.id) ||
              !session.title ||
              !session.status ||
              !session.updatedAt
            ) {
              return null;
            }
            const { id, title, status, updatedAt } = session;
            return { id, title, status, updatedAt };
          } catch {
            return null;
          }
        }),
    );
    return sessions
      .filter((session): session is SessionSummary => session !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async create(input?: CreateSessionInput): Promise<WritingSession> {
    const session = createEmptySession(input);
    const saved = await this.save(session);
    await this.profileStore.ensureProfile(saved.id, saved.title);
    return saved;
  }

  async load(sessionId: string): Promise<WritingSession> {
    const raw = await fs.readFile(this.sessionPath(sessionId), 'utf8');
    return JSON.parse(raw) as WritingSession;
  }

  async save(session: WritingSession): Promise<WritingSession> {
    const previous = this.saveQueues.get(session.id);
    // 同一会话串行落盘，避免并发保存争用同一个目标文件。
    const saveOperation = (
      previous?.catch(() => undefined) ?? Promise.resolve()
    ).then(async () => {
      await this.initialize();
      const updated = { ...session, updatedAt: new Date().toISOString() };
      await fs.mkdir(this.sessionDirectory(updated.id), { recursive: true });
      const destination = this.sessionPath(updated.id);
      const temporary = `${destination}.${newId()}.tmp`;
      try {
        await fs.writeFile(temporary, JSON.stringify(updated, null, 2), 'utf8');
        await fs.rename(temporary, destination);
        await this.writeMessagesJsonl(updated);
        return updated;
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    this.saveQueues.set(session.id, saveOperation);
    try {
      return await saveOperation;
    } finally {
      if (this.saveQueues.get(session.id) === saveOperation) {
        this.saveQueues.delete(session.id);
      }
    }
  }

  async rename(sessionId: string, title: string): Promise<SessionSummary> {
    const session = await this.load(sessionId);
    const saved = await this.save({
      ...session,
      title: title.trim() || session.title,
    });
    const { id, status, updatedAt } = saved;
    return { id, title: saved.title, status, updatedAt };
  }

  async delete(sessionId: string): Promise<void> {
    // 等待该会话最后一次保存结束，防止删除后被迟到的保存重新创建。
    await this.saveQueues.get(sessionId)?.catch(() => undefined);
    await this.profileStore.delete(sessionId);
    this.saveQueues.delete(sessionId);
  }
}

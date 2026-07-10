import { promises as fs } from 'fs';
import path from 'path';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

export type ProfileConfidence = 'high' | 'medium' | 'low';

export interface ProfileFact {
  key: string;
  value: string;
  source: string;
  confidence: ProfileConfidence;
  timestamp: string;
}

export interface SessionProfile {
  session_id: string;
  created_at: string;
  updated_at: string;
  account_name: string;
  niche: string;
  target_audience: string;
  tone: string;
  posting_schedule: string;
  notes: string;
  facts: ProfileFact[];
}

export interface ProfileUpdateInput {
  field: string;
  value: string;
  reason: string;
  confidence?: ProfileConfidence;
}

const STRUCTURED_FIELDS = new Set([
  'account_name',
  'niche',
  'target_audience',
  'tone',
  'posting_schedule',
  'notes',
]);

function assertSessionId(sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('INVALID_SESSION_ID');
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function createEmptyProfile(
  sessionId: string,
  accountName?: string,
): SessionProfile {
  const now = nowIso();
  return {
    session_id: sessionId,
    created_at: now,
    updated_at: now,
    account_name: accountName?.trim() || '',
    niche: '',
    target_audience: '',
    tone: '',
    posting_schedule: '',
    notes: '',
    facts: [],
  };
}

export default class SessionProfileStore {
  private readonly sessionsDir: string;

  constructor(userDataPath: string) {
    this.sessionsDir = path.join(userDataPath, 'sessions');
  }

  profilePath(sessionId: string): string {
    assertSessionId(sessionId);
    return path.join(this.sessionsDir, sessionId, 'profile.yaml');
  }

  async ensureProfile(
    sessionId: string,
    accountName?: string,
  ): Promise<SessionProfile> {
    try {
      return await this.load(sessionId);
    } catch {
      const profile = createEmptyProfile(sessionId, accountName);
      await this.save(profile);
      return profile;
    }
  }

  async load(sessionId: string): Promise<SessionProfile> {
    const raw = await fs.readFile(this.profilePath(sessionId), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SessionProfile>;
    return {
      ...createEmptyProfile(sessionId),
      ...parsed,
      session_id: sessionId,
      facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    };
  }

  async save(profile: SessionProfile): Promise<SessionProfile> {
    assertSessionId(profile.session_id);
    const updated: SessionProfile = {
      ...profile,
      updated_at: nowIso(),
      facts: profile.facts || [],
    };
    const destination = this.profilePath(updated.session_id);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  }

  async update(
    sessionId: string,
    input: ProfileUpdateInput,
  ): Promise<SessionProfile> {
    if (!STRUCTURED_FIELDS.has(input.field)) {
      throw new Error(`UNSUPPORTED_PROFILE_FIELD:${input.field}`);
    }
    const profile = await this.ensureProfile(sessionId);
    const value = input.value.trim();
    const nextProfile: SessionProfile = {
      ...profile,
      [input.field]:
        input.field === 'notes' && profile.notes
          ? `${profile.notes.trim()}\n- ${value}`
          : value,
      facts: [
        ...profile.facts,
        {
          key: input.field,
          value,
          source: input.reason.trim(),
          confidence: input.confidence || 'high',
          timestamp: nowIso(),
        },
      ],
    };
    return this.save(nextProfile);
  }

  async delete(sessionId: string): Promise<void> {
    await fs.rm(path.dirname(this.profilePath(sessionId)), {
      recursive: true,
      force: true,
    });
  }
}

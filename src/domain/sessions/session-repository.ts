import {
  CreateSessionInput,
  SessionSummary,
  WritingSession,
} from '../../shared/contracts';

export default interface SessionRepository {
  list(): Promise<SessionSummary[]>;
  create(input?: CreateSessionInput): Promise<WritingSession>;
  load(sessionId: string): Promise<WritingSession>;
  save(input: { session: WritingSession }): Promise<WritingSession>;
  delete(input: { sessionId: string }): Promise<void>;
}

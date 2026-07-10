import SessionRepository from '../../domain/sessions/session-repository';
import { SessionSummary, WritingSession } from '../../shared/contracts';

export default async function saveSession(
  session: WritingSession,
  repository: SessionRepository,
): Promise<{ session: WritingSession; sessions: SessionSummary[] }> {
  const saved = await repository.save({ session });
  const sessions = await repository.list();
  return { session: saved, sessions };
}

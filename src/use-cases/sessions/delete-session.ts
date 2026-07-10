import SessionRepository from '../../domain/sessions/session-repository';
import { SessionSummary, WritingSession } from '../../shared/contracts';

export default async function deleteSession(
  sessionId: string,
  repository: SessionRepository,
): Promise<{ sessions: SessionSummary[]; activeSession: WritingSession }> {
  await repository.delete({ sessionId });
  let sessions = await repository.list();
  const activeSession =
    sessions.length > 0
      ? await repository.load(sessions[0].id)
      : await repository.create({ title: '未命名文章' });
  if (sessions.length === 0) sessions = await repository.list();
  return { sessions, activeSession };
}

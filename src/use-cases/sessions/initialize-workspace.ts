import SessionRepository from '../../domain/sessions/session-repository';
import { SessionSummary, WritingSession } from '../../shared/contracts';

export interface InitialWorkspace {
  sessions: SessionSummary[];
  activeSession: WritingSession;
}

export default async function initializeWorkspace(
  repository: SessionRepository,
): Promise<InitialWorkspace> {
  let sessions = await repository.list();
  const activeSession =
    sessions.length === 0
      ? await repository.create({ title: '未命名文章' })
      : await repository.load(sessions[0].id);

  if (sessions.length === 0) sessions = await repository.list();
  return { sessions, activeSession };
}

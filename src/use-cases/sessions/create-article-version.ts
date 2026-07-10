import { ArticleVersion, WritingSession } from '../../shared/contracts';

export default function createArticleVersion(
  session: WritingSession,
  title: string,
  markdown: string,
  now = new Date(),
): WritingSession {
  const timestamp = now.getTime();
  const version: ArticleVersion = {
    id: `version-${timestamp}`,
    title,
    markdown,
    label: title,
    createdAt: now.toISOString(),
  };
  return {
    ...session,
    title,
    versions: [...session.versions, version],
    activeVersionId: version.id,
  };
}

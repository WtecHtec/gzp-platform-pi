import type { SessionProfile } from './session-profile-store';

function line(label: string, value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? `- ${label}：${trimmed}` : null;
}

export default function buildSystemPromptWithProfile(
  basePrompt: string,
  profile: SessionProfile,
): string {
  const profileLines = [
    line('账号名称', profile.account_name),
    line('定位方向', profile.niche),
    line('目标受众', profile.target_audience),
    line('风格基调', profile.tone),
    line('发布节奏', profile.posting_schedule),
  ].filter((item): item is string => item !== null);

  const profileSection =
    profileLines.length > 0 || profile.notes.trim()
      ? `\n\n## 长期记忆（关于该公众号的已知信息）\n${profileLines.join(
          '\n',
        )}${
          profile.notes.trim() ? `\n\n补充笔记：\n${profile.notes.trim()}` : ''
        }`
      : '';

  return `${basePrompt}${profileSection}

## 长期记忆写入规则
当用户提供的信息是关于账号本身的持久属性（名称、定位、目标受众、长期风格偏好、发布节奏、明确的规则性纠正），而不是针对某一篇具体内容的临时要求时，调用 update_profile 工具记录。
当用户明确说“记住”“以后都”“下次也”“长期”“永久”时，优先判断是否调用 update_profile。
不确定是否属于长期偏好时，先向用户确认，不要自行写入。`;
}

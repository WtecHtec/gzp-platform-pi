import type { SkillDescriptor } from '../../shared/contracts';

export default function buildSkillPrompt(skills: SkillDescriptor[]): string {
  const usableSkills = skills.filter(
    (skill) => skill.status === 'ready' || skill.status === 'missing_deps',
  );

  const skillLines =
    usableSkills.length > 0
      ? usableSkills
          .map(
            (skill) =>
              `- ${skill.id} (${skill.name})：${
                skill.description || '无描述'
              }`,
          )
          .join('\n')
      : '- 当前应用 skills 文件夹中还没有可用技能。';

  return `## 可用技能包
${skillLines}

使用规则：
- 当任务明显匹配某个技能包时，先调用 load_skill 读取该技能的 SKILL.md，再按技能说明执行。
- 需要读取技能包内参考文件时，继续用 load_skill 的 section 参数加载具体相对路径。
- 当用户发送 GitHub 仓库链接并表达安装/添加 skill 的意图时，调用 install_skill_from_url，将技能安装到应用的 skills 文件夹。
- 不要假设未安装技能可用；安装完成后再调用 load_skill。`;
}

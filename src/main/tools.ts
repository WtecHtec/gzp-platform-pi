import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs, constants } from 'fs';
import path from 'path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import ApplicationLogger from '../domain/observability/application-logger';
import SkillManager from './skills/skill-manager';
import SearchSettingsStore from './search-settings-store';
import { performTavilySearch, performBraveSearch } from './search-helper';

const executeFile = promisify(execFile);

/**
 * Resolves path safely against a root folder. Strips leading slashes to prevent
 * treating relative paths as root-level absolute paths on POSIX.
 */
function resolveSafePath(root: string, inputPath: string): string | null {
  const normalRoot = path.resolve(root);
  const normalizedInput = path.normalize(inputPath);

  if (path.isAbsolute(normalizedInput)) {
    if (
      normalizedInput === normalRoot ||
      normalizedInput.startsWith(`${normalRoot}${path.sep}`)
    ) {
      return normalizedInput;
    }
    return null; // Strict match for absolute paths to prevent absolute paths outside the root from being mangled.
  }

  const cleanRelative = inputPath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(normalRoot, cleanRelative);
  if (
    resolved === normalRoot ||
    resolved.startsWith(`${normalRoot}${path.sep}`)
  ) {
    return resolved;
  }
  return null;
}

function isDangerousCommand(command: string): {
  dangerous: boolean;
  reason?: string;
} {
  const trimmed = command.trim().toLowerCase();

  // 1. Block destructive file deletion/formatting
  if (/\brm\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 rm 命令删除文件或目录' };
  if (/\brmdir\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 rmdir 命令删除目录' };
  if (/\bdel\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 del 命令删除文件' };
  if (/\bformat\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 format 命令' };
  if (/\bmkfs\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 mkfs 命令' };

  // 2. Block privilege escalation and process manipulation
  if (/\bsudo\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 sudo 获取特权执行命令' };
  if (/\bsu\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 su 切换用户' };
  if (/\bchmod\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止修改文件权限' };
  if (/\bchown\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止修改文件所有者' };
  if (/\bkill\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 kill 强杀进程' };
  if (/\bpkill\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 pkill 强杀进程' };
  if (/\bkillall\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止使用 killall 强杀进程' };

  // 3. Block system control
  if (/\bshutdown\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止关闭系统' };
  if (/\breboot\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止重启系统' };

  // 4. Block pipe execution of untrusted scripts (e.g. curl ... | sh)
  if (/\|\s*(bash|sh)\b/i.test(trimmed))
    return { dangerous: true, reason: '禁止通过管道直接执行网络脚本' };

  return { dangerous: false };
}

export default function createBasicTools(
  workspaceRootFn: () => Promise<string>,
  logger: ApplicationLogger,
  skillManager: SkillManager,
  searchSettingsStore: SearchSettingsStore,
): AgentTool[] {
  const bashTool: AgentTool = {
    name: 'bash',
    label: '执行系统命令',
    description:
      '在当前应用工作区安全执行系统命令。禁止删除、破坏或危险的系统操作。',
    parameters: Type.Object({
      command: Type.String(),
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, parameters, signal) => {
      const workspaceRoot = await workspaceRootFn();
      const input = parameters as { command: string };

      const check = isDangerousCommand(input.command);
      if (check.dangerous) {
        return {
          content: [
            {
              type: 'text',
              text: `执行失败：该命令被安全策略拦截。原因：${check.reason}`,
            },
          ],
          details: { command: input.command, error: check.reason },
          isError: true,
        };
      }

      // If .venv exists in workspace root, prepend it to PATH
      const venvBinDir = path.join(workspaceRoot, '.venv', 'bin');
      const customEnv = { ...process.env };
      try {
        await fs.access(venvBinDir, constants.X_OK);
        customEnv.PATH = `${venvBinDir}${path.delimiter}${process.env.PATH}`;
      } catch {
        // No .venv or not executable, use standard PATH
      }

      logger.info('bash.command.started', { command: input.command });
      try {
        const result = await executeFile('sh', ['-c', input.command], {
          cwd: workspaceRoot,
          env: customEnv,
          signal,
          timeout: 60_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        logger.info('bash.command.completed', { command: input.command });
        return {
          content: [
            {
              type: 'text',
              text: result.stdout || result.stderr || '（无输出）',
            },
          ],
          details: { command: input.command },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.info('bash.command.failed', {
          command: input.command,
          error: message,
        });
        return {
          content: [{ type: 'text', text: `命令执行失败：${message}` }],
          details: { command: input.command, error: message },
          isError: true,
        };
      }
    },
  };

  const readTool: AgentTool = {
    name: 'read',
    label: '读取文件',
    description: '读取工作区目录下的 UTF-8 文本文件内容。',
    parameters: Type.Object({ path: Type.String() }),
    execute: async (_toolCallId, parameters) => {
      const workspaceRoot = await workspaceRootFn();
      const input = parameters as { path: string };

      const filePath = resolveSafePath(workspaceRoot, input.path);
      if (!filePath) {
        throw new Error('WORKSPACE_PATH_OUTSIDE_ROOT');
      }

      const content = await fs.readFile(filePath, 'utf8');
      logger.info('workspace.file.read', {
        path: input.path,
        bytes: Buffer.byteLength(content),
      });
      return {
        content: [{ type: 'text', text: content }],
        details: { path: input.path, absolutePath: filePath },
      };
    },
  };

  const writeTool: AgentTool = {
    name: 'write',
    label: '写入文件',
    description: '在工作区目录下创建或覆盖文件，保存文章、摘要或中间产物。',
    parameters: Type.Object({
      path: Type.String(),
      content: Type.String(),
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, parameters) => {
      const workspaceRoot = await workspaceRootFn();
      const input = parameters as { path: string; content: string };

      const filePath = resolveSafePath(workspaceRoot, input.path);
      if (!filePath) {
        throw new Error('WORKSPACE_PATH_OUTSIDE_ROOT');
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.content, 'utf8');
      logger.info('workspace.file.written', {
        path: input.path,
        bytes: Buffer.byteLength(input.content),
      });
      return {
        content: [{ type: 'text', text: `已写入 ${filePath}` }],
        details: { path: input.path, absolutePath: filePath },
      };
    },
  };

  const loadSkillTool: AgentTool = {
    name: 'load_skill',
    label: '加载技能包文档',
    description: '读取指定 Skill 的完整说明文档或参考资料。仅在确定需要执行某个具体阶段时调用，不要预先加载所有内容。',
    parameters: Type.Object({
      name: Type.String({ description: 'Skill 名称(wewrite / gzh-design)' }),
      section: Type.Optional(Type.String({ description: '技能包内的相对路径（例如 references/xxxx.md），留空读取 SKILL.md 主文档' }))
    }),
    execute: async (_toolCallId, parameters) => {
      const input = parameters as { name: string; section?: string };
      try {
        const content = await skillManager.getSkillContent(input.name, input.section);
        return {
          content: [{ type: 'text', text: content }],
          details: { name: input.name, section: input.section }
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `读取技能文档失败: ${err instanceof Error ? err.message : String(err)}` }],
          details: { name: input.name, error: String(err) },
          isError: true
        };
      }
    }
  };

  const runSkillScriptTool: AgentTool = {
    name: 'run_skill_script',
    label: '执行技能脚本',
    description: '在指定技能包的隔离运行环境中执行一个脚本文件。你不需要也不应该自己拼接解释器路径或激活虚拟环境。',
    parameters: Type.Object({
      skill: Type.String({ description: 'Skill 名称' }),
      script: Type.String({ description: '脚本的相对路径（如 scripts/fetch_hotspots.py）' }),
      args: Type.Optional(Type.Array(Type.String(), { description: '命令行参数' }))
    }),
    executionMode: 'sequential',
    execute: async (_toolCallId, parameters, signal) => {
      const input = parameters as { skill: string; script: string; args?: string[] };
      const skillPath = path.join(skillManager.getSkillsDirectory(), input.skill);
      
      // Safety check: ensure skillPath is inside the skills directory
      if (!skillPath.startsWith(skillManager.getSkillsDirectory())) {
        throw new Error('ACCESS_DENIED_OUTSIDE_SKILLS_DIRECTORY');
      }
      
      const scriptPath = path.resolve(skillPath, input.script);
      if (!scriptPath.startsWith(skillPath)) {
        throw new Error('ACCESS_DENIED_OUTSIDE_SKILL_DIRECTORY');
      }

      // Detect interpreter
      let command = '';
      let runArgs: string[] = [];
      const ext = path.extname(scriptPath).toLowerCase();
      
      if (ext === '.py') {
        const venvPython = process.platform === 'win32'
          ? path.join(skillPath, '.venv', 'Scripts', 'python.exe')
          : path.join(skillPath, '.venv', 'bin', 'python');
        
        let useVenv = false;
        try {
          await fs.access(venvPython);
          useVenv = true;
        } catch {}
        
        command = useVenv ? venvPython : 'python3';
        runArgs = [scriptPath, ...(input.args || [])];
      } else if (ext === '.js') {
        command = process.execPath; // Node.js runtime of current Electron process
        runArgs = [scriptPath, ...(input.args || [])];
      } else {
        command = 'sh';
        runArgs = [scriptPath, ...(input.args || [])];
      }

      logger.info('skills.script.started', { skill: input.skill, script: input.script });
      try {
        const res = await executeFile(command, runArgs, {
          cwd: skillPath,
          signal,
          timeout: 120_000,
          maxBuffer: 4 * 1024 * 1024
        });
        logger.info('skills.script.completed', { skill: input.skill, script: input.script });
        return {
          content: [{ type: 'text', text: res.stdout || res.stderr || '（无输出）' }],
          details: { skill: input.skill, script: input.script }
        };
      } catch (err: any) {
        logger.info('skills.script.failed', { skill: input.skill, script: input.script, error: err.message });
        return {
          content: [{ type: 'text', text: `执行脚本失败: ${err.message}` }],
          details: { skill: input.skill, script: input.script, error: err.message },
          isError: true
        };
      }
    }
  };

  const installSkillFromUrlTool: AgentTool = {
    name: 'install_skill_from_url',
    label: '安装技能包',
    description:
      '当用户发送 GitHub 仓库链接并明确要求安装、添加或启用某个 skill/技能包时调用。技能会安装到应用的 skills 文件夹。',
    parameters: {
      type: 'object',
      properties: {
        repoUrl: {
          type: 'string',
          description: 'GitHub 仓库 URL，例如 https://github.com/org/skill.git',
        },
        skillId: {
          type: 'string',
          description: '可选的技能目录名；不填则根据仓库名自动生成',
        },
      },
      required: ['repoUrl'],
    } as any,
    executionMode: 'sequential',
    execute: async (_toolCallId, parameters) => {
      const input = parameters as { repoUrl: string; skillId?: string };
      const result = await skillManager.installSkill({
        repoUrl: input.repoUrl,
        skillId: input.skillId,
      });
      return {
        content: [
          {
            type: 'text',
            text: result.success
              ? `已安装技能包 ${result.skillId} 到应用 skills 文件夹。`
              : `技能包安装失败：${result.output}`,
          },
        ],
        details: result,
      };
    },
  };

  const webSearchTool: AgentTool = {
    name: 'web_search',
    label: '网页搜索',
    description: '搜索互联网获取最新的时效性信息、时事新闻或补充知识。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的关键词或句子',
        },
        max_results: {
          type: 'integer',
          description: '可选，最多返回的结果数，默认 5 条',
        },
      },
      required: ['query'],
    } as any,
    execute: async (_toolCallId, parameters) => {
      const input = parameters as { query: string; max_results?: number };
      const query = input.query.trim();
      const limit = Math.min(Math.max(input.max_results || 5, 1), 10);

      const keys = await searchSettingsStore.resolve();
      const errors: string[] = [];

      // 1. Try Tavily first
      if (keys.tavilyApiKey) {
        try {
          logger.info('web_search.tavily.started', { query, limit });
          const formattedResults = await performTavilySearch(keys.tavilyApiKey, query, limit);
          logger.info('web_search.tavily.success', { count: formattedResults.length });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formattedResults, null, 2),
              },
            ],
            details: { query, provider: 'tavily', count: formattedResults.length },
          };
        } catch (err: any) {
          errors.push(`Tavily 请求异常/失败: ${err.message || err}`);
        }
      } else {
        errors.push('Tavily API Key 未配置');
      }

      // 2. Try Brave Search backup
      if (keys.braveApiKey) {
        try {
          logger.info('web_search.brave.started', { query, limit });
          const formattedResults = await performBraveSearch(keys.braveApiKey, query, limit);
          logger.info('web_search.brave.success', { count: formattedResults.length });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formattedResults, null, 2),
              },
            ],
            details: { query, provider: 'brave', count: formattedResults.length },
          };
        } catch (err: any) {
          errors.push(`Brave Search 请求异常/失败: ${err.message || err}`);
        }
      } else {
        errors.push('Brave Search API Key 未配置');
      }

      // 3. Both failed
      const errorMsg = `网络搜索失败或未配置服务。\n${errors.join('\n')}\n请在"设置 -> 搜索服务"中配置有效的 API 密钥。`;
      logger.error('web_search.failed', { query, errors });
      return {
        content: [{ type: 'text', text: errorMsg }],
        details: { query, errors },
        isError: true,
      };
    },
  };

  return [
    bashTool,
    readTool,
    writeTool,
    loadSkillTool,
    runSkillScriptTool,
    installSkillFromUrlTool,
    webSearchTool,
  ];
}

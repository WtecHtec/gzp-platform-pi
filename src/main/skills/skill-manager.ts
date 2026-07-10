import { promises as fs } from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { app, shell } from 'electron';
import type {
  SkillDescriptor,
  SkillStatus,
  InstallSkillInput,
  InstallSkillResult,
  CheckSkillUpdateResult,
  UpdateSkillResult,
} from '../../shared/contracts';
import ApplicationLogger from '../../domain/observability/application-logger';

const executeFile = promisify(execFile);

interface DefaultSkillPreset {
  id: string;
  name: string;
  description: string;
  repoUrl: string;
}

const DEFAULT_PRESETS: DefaultSkillPreset[] = [
  {
    id: 'wewrite',
    name: 'wewrite',
    description: '公众号文章全流程创作(热点抓取/选题/写作框架/素材采集/SEO优化/配图/排版/发布/效果复盘)',
    repoUrl: 'https://github.com/oaker-io/wewrite.git',
  },
  {
    id: 'gzh-design',
    name: 'gzh-design',
    description: '将已有 Markdown 正文排版为可直接粘贴到微信公众号编辑器的精致 HTML',
    repoUrl: 'https://github.com/isjiamu/gzh-design-skill.git',
  },
];

function trimFrontmatterQuotes(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function countLeadingSpaces(value: string): number {
  return value.length - value.trimStart().length;
}

function readBlockScalar(
  lines: string[],
  startIndex: number,
  foldLines: boolean,
): { value: string; nextIndex: number } {
  const blockLines: string[] = [];
  let index = startIndex;
  let minIndent = Number.POSITIVE_INFINITY;

  while (index + 1 < lines.length && /^\s/.test(lines[index + 1])) {
    index += 1;
    const line = lines[index];
    if (line.trim()) {
      minIndent = Math.min(minIndent, countLeadingSpaces(line));
    }
    blockLines.push(line);
  }

  const indent = Number.isFinite(minIndent) ? minIndent : 0;
  const normalized = blockLines.map((line) => line.slice(indent).trimEnd());

  return {
    value: normalized.join(foldLines ? ' ' : '\n').trim(),
    nextIndex: index,
  };
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return { name: '', description: '' };

  const result: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) continue;

    if (value === '|' || value === '>') {
      const block = readBlockScalar(lines, index, value === '>');
      result[key] = block.value;
      index = block.nextIndex;
      continue;
    }

    result[key] = trimFrontmatterQuotes(value);
  }

  return {
    name: result.name || '',
    description: result.description || '',
  };
}

function normalizeSkillId(value: string): string {
  const normalized = value
    .replace(/\.git$/i, '')
    .split('/')
    .filter(Boolean)
    .pop();
  return (
    normalized
      ?.replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || `skill-${Date.now()}`
  );
}

export default class SkillManager {
  private readonly skillsDir: string;
  private readonly logger: ApplicationLogger;

  constructor(userDataPath: string, logger: ApplicationLogger) {
    this.skillsDir = path.join(userDataPath, 'skills');
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.skillsDir, { recursive: true });
  }

  getSkillsDirectory(): string {
    return this.skillsDir;
  }

  async listSkills(): Promise<SkillDescriptor[]> {
    await this.initialize();
    const list: SkillDescriptor[] = [];
    
    // Read local folders
    let folders: string[] = [];
    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      folders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (err) {
      this.logger.error('skills.list.read_dir_failed', { error: err });
    }

    const processedIds = new Set<string>();

    // Process installed skills
    for (const folder of folders) {
      const skillPath = path.join(this.skillsDir, folder);
      processedIds.add(folder);
      
      try {
        const descriptor = await this.readSkillDescriptor(folder, skillPath);
        list.push(descriptor);
      } catch (err) {
        this.logger.error('skills.list.read_descriptor_failed', { folder, error: err });
        list.push({
          id: folder,
          name: folder,
          description: '读取 Skill 失败',
          path: skillPath,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Process presets that are not installed
    for (const preset of DEFAULT_PRESETS) {
      if (!processedIds.has(preset.id)) {
        list.push({
          id: preset.id,
          name: preset.name,
          description: preset.description,
          path: path.join(this.skillsDir, preset.id),
          status: 'not_installed',
        });
      }
    }

    return list;
  }

  private async readSkillDescriptor(id: string, skillPath: string): Promise<SkillDescriptor> {
    const skillMdPath = path.join(skillPath, 'SKILL.md');
    let name = id;
    let description = '';
    
    try {
      const content = await fs.readFile(skillMdPath, 'utf8');
      const fm = parseFrontmatter(content);
      if (fm.name) name = fm.name;
      if (fm.description) description = fm.description;
    } catch {
      // Allow fallback if SKILL.md is missing
      description = '缺少 SKILL.md 文件';
    }

    // Get current git commit hash
    let commitHash: string | undefined;
    try {
      const { stdout } = await executeFile('git', ['rev-parse', 'HEAD'], { cwd: skillPath });
      commitHash = stdout.trim().substring(0, 7);
    } catch {
      // Not a git repo or git missing
    }

    // Determine status based on dependency files
    let status: SkillStatus = 'ready';
    try {
      const reqTxtExists = await this.fileExists(path.join(skillPath, 'requirements.txt'));
      const venvExists = await this.dirExists(path.join(skillPath, '.venv'));
      const packageJsonExists = await this.fileExists(path.join(skillPath, 'package.json'));
      const nodeModulesExists = await this.dirExists(path.join(skillPath, 'node_modules'));

      if ((reqTxtExists && !venvExists) || (packageJsonExists && !nodeModulesExists)) {
        status = 'missing_deps';
      }
    } catch (err) {
      status = 'error';
    }

    return {
      id,
      name,
      description,
      path: skillPath,
      status,
      commitHash,
    };
  }

  async getSkillContent(skillId: string, section?: string): Promise<string> {
    const skillPath = path.join(this.skillsDir, skillId);
    let targetFile = path.join(skillPath, 'SKILL.md');

    if (section) {
      // Prevent path traversal
      const resolved = path.resolve(skillPath, section);
      if (!resolved.startsWith(skillPath)) {
        throw new Error('ACCESS_DENIED_OUTSIDE_SKILL_DIRECTORY');
      }
      targetFile = resolved;
    }

    return await fs.readFile(targetFile, 'utf8');
  }

  async installSkill(input: InstallSkillInput): Promise<InstallSkillResult> {
    await this.initialize();
    
    // Determine skill folder ID
    const skillId = normalizeSkillId(input.skillId || input.repoUrl);

    const skillPath = path.join(this.skillsDir, skillId);
    
    // Clean up if directory already exists
    if (await this.dirExists(skillPath)) {
      await fs.rm(skillPath, { recursive: true, force: true });
    }

    this.logger.info('skills.install.cloning', { repoUrl: input.repoUrl, skillId });
    
    let installOutput = '';
    try {
      const cloneRes = await executeFile('git', ['clone', input.repoUrl, skillId], { cwd: this.skillsDir });
      installOutput += `Cloning skill:\n${cloneRes.stdout}\n${cloneRes.stderr}\n`;

      // Setup dependencies
      const depRes = await this.setupDependencies(skillPath);
      installOutput += depRes;

      return {
        success: true,
        skillId,
        output: installOutput,
      };
    } catch (err) {
      this.logger.error('skills.install.failed', { repoUrl: input.repoUrl, skillId, error: err });
      return {
        success: false,
        skillId,
        output: `${installOutput}\n安装失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async removeSkill(skillId: string): Promise<void> {
    const skillPath = path.join(this.skillsDir, skillId);
    if (await this.dirExists(skillPath)) {
      this.logger.info('skills.remove', { skillId });
      await fs.rm(skillPath, { recursive: true, force: true });
    }
  }

  async checkSkillUpdate(skillId: string): Promise<CheckSkillUpdateResult> {
    const skillPath = path.join(this.skillsDir, skillId);
    if (!(await this.dirExists(skillPath))) {
      throw new Error('SKILL_NOT_FOUND');
    }

    try {
      // Fetch updates
      await executeFile('git', ['fetch', 'origin'], { cwd: skillPath });
      
      const { stdout: localHead } = await executeFile('git', ['rev-parse', 'HEAD'], { cwd: skillPath });
      
      // Determine default remote branch
      let remoteBranch = 'origin/main';
      try {
        const { stdout: symref } = await executeFile('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd: skillPath });
        remoteBranch = symref.trim();
      } catch {
        // Fallback or probe origin/master
        try {
          await executeFile('git', ['rev-parse', 'origin/master'], { cwd: skillPath });
          remoteBranch = 'origin/master';
        } catch {}
      }

      const { stdout: remoteHead } = await executeFile('git', ['rev-parse', remoteBranch], { cwd: skillPath });

      const currentCommitHash = localHead.trim();
      const latestCommitHash = remoteHead.trim();
      const updateAvailable = currentCommitHash !== latestCommitHash;

      let changelog = '';
      if (updateAvailable) {
        const { stdout: diff } = await executeFile('git', ['log', '--oneline', `${currentCommitHash}..${latestCommitHash}`], { cwd: skillPath });
        changelog = diff.trim();
      }

      return {
        skillId,
        updateAvailable,
        currentCommitHash: currentCommitHash.substring(0, 7),
        latestCommitHash: latestCommitHash.substring(0, 7),
        changelog,
      };
    } catch (err) {
      this.logger.error('skills.check_update.failed', { skillId, error: err });
      throw err;
    }
  }

  async updateSkill(skillId: string): Promise<UpdateSkillResult> {
    const skillPath = path.join(this.skillsDir, skillId);
    if (!(await this.dirExists(skillPath))) {
      throw new Error('SKILL_NOT_FOUND');
    }

    let output = '';
    try {
      const pullRes = await executeFile('git', ['pull'], { cwd: skillPath });
      output += `Pulling updates:\n${pullRes.stdout}\n${pullRes.stderr}\n`;

      const depRes = await this.setupDependencies(skillPath);
      output += depRes;

      return {
        success: true,
        skillId,
        output,
      };
    } catch (err) {
      this.logger.error('skills.update.failed', { skillId, error: err });
      return {
        success: false,
        skillId,
        output: `${output}\n更新失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async openSkillDirectory(skillId: string): Promise<void> {
    const skillPath = path.join(this.skillsDir, skillId);
    await fs.mkdir(skillPath, { recursive: true });
    await shell.openPath(skillPath);
  }

  private async setupDependencies(skillPath: string): Promise<string> {
    let output = '';

    // Python virtualenv dependency install
    const reqTxtPath = path.join(skillPath, 'requirements.txt');
    if (await this.fileExists(reqTxtPath)) {
      output += 'Found requirements.txt. Setting up Python venv...\n';
      try {
        await executeFile('python3', ['-m', 'venv', '.venv'], { cwd: skillPath });
        
        // Determine platform pip path
        const pipPath = process.platform === 'win32' 
          ? path.join('.venv', 'Scripts', 'pip.exe')
          : path.join('.venv', 'bin', 'pip');

        const pipRes = await executeFile(pipPath, ['install', '-r', 'requirements.txt'], { cwd: skillPath });
        output += `Pip installation:\n${pipRes.stdout}\n${pipRes.stderr}\n`;
      } catch (err) {
        output += `Python venv/pip error: ${err instanceof Error ? err.message : String(err)}\n`;
        throw err;
      }
    }

    // Node.js npm package dependency install
    const packageJsonPath = path.join(skillPath, 'package.json');
    if (await this.fileExists(packageJsonPath)) {
      output += 'Found package.json. Setting up Node packages...\n';
      try {
        const npmRes = await executeFile('npm', ['install', '--ignore-scripts'], { cwd: skillPath });
        output += `Npm installation:\n${npmRes.stdout}\n${npmRes.stderr}\n`;
      } catch (err) {
        output += `Npm installation error: ${err instanceof Error ? err.message : String(err)}\n`;
        throw err;
      }
    }

    return output;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  private async dirExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}

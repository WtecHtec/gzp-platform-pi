import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';

const SETTINGS_FILE = 'workspace-settings.json';

interface StoredWorkspaceSettings {
  directory: string;
  skills?: string[];
}

function defaultDirectory(): string {
  // Use ~/Documents/gzh-platform as the default output location,
  // which is a natural place users expect files to appear.
  return path.join(app.getPath('documents'), 'gzh-platform');
}

function defaultSkills(): string[] {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', 'skills')
    : path.join(__dirname, '../../assets/skills');
  return [path.join(root, 'wewrite'), path.join(root, 'gzh-design')];
}

export interface WorkspaceConfig {
  directory: string;
  skills: string[];
}

export default class WorkspaceSettingsStore {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, SETTINGS_FILE);
  }

  private async read(): Promise<StoredWorkspaceSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as StoredWorkspaceSettings;
      return {
        directory: parsed.directory || defaultDirectory(),
        skills:
          parsed.skills && parsed.skills.length > 0
            ? parsed.skills
            : defaultSkills(),
      };
    } catch {
      return {
        directory: defaultDirectory(),
        skills: defaultSkills(),
      };
    }
  }

  async get(): Promise<WorkspaceConfig> {
    const stored = await this.read();
    return {
      directory: stored.directory,
      skills: stored.skills || defaultSkills(),
    };
  }

  async save(directory: string, skills: string[]): Promise<WorkspaceConfig> {
    const normalizedDir = path.normalize(directory.trim());
    const normalizedSkills = skills.map((s) => path.normalize(s.trim()));
    const stored: StoredWorkspaceSettings = {
      directory: normalizedDir,
      skills: normalizedSkills,
    };
    const temporary = `${this.settingsPath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(stored, null, 2), 'utf8');
    await fs.rename(temporary, this.settingsPath);
    return {
      directory: normalizedDir,
      skills: normalizedSkills,
    };
  }
}

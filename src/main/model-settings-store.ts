import { promises as fs } from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import { ModelSettings, SaveModelSettingsInput } from '../shared/contracts';

interface StoredModelSettings {
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
}

export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

const defaults: StoredModelSettings = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
};

export default class ModelSettingsStore {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, 'model-settings.json');
  }

  private async read(): Promise<StoredModelSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      return { ...defaults, ...(JSON.parse(raw) as StoredModelSettings) };
    } catch {
      return defaults;
    }
  }

  async get(): Promise<ModelSettings> {
    const stored = await this.read();
    return {
      baseUrl: stored.baseUrl,
      model: stored.model,
      apiKeyConfigured: Boolean(stored.encryptedApiKey),
    };
  }

  async save(input: SaveModelSettingsInput): Promise<ModelSettings> {
    const current = await this.read();
    let { encryptedApiKey } = current;
    const { apiKey: inputApiKey } = input;
    if (inputApiKey?.trim()) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('SECURE_STORAGE_UNAVAILABLE');
      }
      encryptedApiKey = safeStorage
        .encryptString(inputApiKey.trim())
        .toString('base64');
    }
    const stored: StoredModelSettings = {
      baseUrl: input.baseUrl.trim().replace(/\/+$/, ''),
      model: input.model.trim(),
      encryptedApiKey,
    };
    const temporary = `${this.settingsPath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(stored, null, 2), 'utf8');
    await fs.rename(temporary, this.settingsPath);
    return this.get();
  }

  async resolve(input?: SaveModelSettingsInput): Promise<LlmConfig> {
    const stored = await this.read();
    const encrypted = stored.encryptedApiKey;
    let apiKey = input?.apiKey?.trim() || '';
    if (!apiKey && encrypted && safeStorage.isEncryptionAvailable()) {
      apiKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    }
    return {
      baseUrl: (input?.baseUrl || stored.baseUrl).trim().replace(/\/+$/, ''),
      model: (input?.model || stored.model).trim(),
      apiKey,
    };
  }
}

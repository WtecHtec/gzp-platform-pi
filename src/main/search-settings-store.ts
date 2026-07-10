import { promises as fs } from 'fs';
import path from 'path';
import { safeStorage } from 'electron';
import { SearchSettings, SaveSearchSettingsInput } from '../shared/contracts';

interface StoredSearchSettings {
  encryptedTavilyApiKey?: string;
  encryptedBraveApiKey?: string;
}

export interface ResolvedSearchKeys {
  tavilyApiKey: string;
  braveApiKey: string;
}

export default class SearchSettingsStore {
  private readonly settingsPath: string;

  constructor(userDataPath: string) {
    this.settingsPath = path.join(userDataPath, 'search-settings.json');
  }

  private async read(): Promise<StoredSearchSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, 'utf8');
      return JSON.parse(raw) as StoredSearchSettings;
    } catch {
      return {};
    }
  }

  async get(): Promise<SearchSettings> {
    const stored = await this.read();
    return {
      tavilyApiKeyConfigured: Boolean(stored.encryptedTavilyApiKey),
      braveApiKeyConfigured: Boolean(stored.encryptedBraveApiKey),
    };
  }

  async save(input: SaveSearchSettingsInput): Promise<SearchSettings> {
    const current = await this.read();
    let encryptedTavilyApiKey = current.encryptedTavilyApiKey;
    let encryptedBraveApiKey = current.encryptedBraveApiKey;

    // Handle Tavily key
    if (input.tavilyApiKey !== undefined) {
      const keyVal = input.tavilyApiKey.trim();
      if (keyVal === '') {
        encryptedTavilyApiKey = undefined;
      } else {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('SECURE_STORAGE_UNAVAILABLE');
        }
        encryptedTavilyApiKey = safeStorage
          .encryptString(keyVal)
          .toString('base64');
      }
    }

    // Handle Brave key
    if (input.braveApiKey !== undefined) {
      const keyVal = input.braveApiKey.trim();
      if (keyVal === '') {
        encryptedBraveApiKey = undefined;
      } else {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error('SECURE_STORAGE_UNAVAILABLE');
        }
        encryptedBraveApiKey = safeStorage
          .encryptString(keyVal)
          .toString('base64');
      }
    }

    const stored: StoredSearchSettings = {
      encryptedTavilyApiKey,
      encryptedBraveApiKey,
    };

    const temporary = `${this.settingsPath}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(stored, null, 2), 'utf8');
    await fs.rename(temporary, this.settingsPath);
    return this.get();
  }

  async resolve(): Promise<ResolvedSearchKeys> {
    const stored = await this.read();
    let tavilyApiKey = '';
    let braveApiKey = '';

    if (stored.encryptedTavilyApiKey && safeStorage.isEncryptionAvailable()) {
      try {
        tavilyApiKey = safeStorage.decryptString(
          Buffer.from(stored.encryptedTavilyApiKey, 'base64'),
        );
      } catch (err) {
        console.error('Failed to decrypt Tavily API Key:', err);
      }
    }

    if (stored.encryptedBraveApiKey && safeStorage.isEncryptionAvailable()) {
      try {
        braveApiKey = safeStorage.decryptString(
          Buffer.from(stored.encryptedBraveApiKey, 'base64'),
        );
      } catch (err) {
        console.error('Failed to decrypt Brave API Key:', err);
      }
    }

    return { tavilyApiKey, braveApiKey };
  }
}

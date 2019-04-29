import { homedir } from 'os';
import { resolve as resolvePath } from 'path';
import { AccountInfo, AccountUser, AccountTokens } from './AccountManager';
import { readFile } from '../utils';

export const CLI_API_CONFIG = {
  clientId:
    '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
};

export interface CliConfig {
  motd: {
    minVersion: string;
  };
  'motd.fetched': number;
  activeProjects: {
    // '/path/to/folder': 'project-id or alias'
    [path: string]: string;
  };
  previews: {
    mods: boolean;
    functions: boolean;
    firestore: boolean;
    taberna: boolean;
  };
  'analytics-uuid': string;
  usage: false;
  user: AccountUser;
  tokens: AccountTokens;
}

export function getCliConfigPath(): string {
  return resolvePath(
    homedir(),
    '.config',
    'configstore',
    'firebase-tools.json'
  );
}

export async function getCliConfig(): Promise<CliConfig | undefined> {
  try {
    const configPath = getCliConfigPath();
    return JSON.parse(await readFile(configPath, 'utf8'));
  } catch (err) {
    // Couldn't read or parse the file. Maybe it doesn't exist, that's OK.
    return;
  }
}

export async function getCliAccount(): Promise<AccountInfo | null> {
  const cachedConfig = await getCliConfig();

  if (cachedConfig) {
    const { user, tokens } = cachedConfig;
    return { user, tokens, origin: 'cli' };
  }

  return null;
}

import { homedir } from 'os';
import { resolve as resolvePath } from 'path';
import { AccountInfo } from './AccountManager';
import { readFile } from '../utils';

export const CLI_API_CONFIG = {
  clientId:
    '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
};

export async function getCliAccount(): Promise<AccountInfo | null> {
  let cachedConfig: any;

  try {
    const configPath = resolvePath(
      homedir(),
      '.config/configstore/firebase-tools.json'
    );
    
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    cachedConfig = config;
  } catch (err) {
    /* no problem */
  }

  if (cachedConfig) {
    const { user, tokens } = cachedConfig;
    return { user, tokens, origin: 'cli' };
  }

  return null;
}

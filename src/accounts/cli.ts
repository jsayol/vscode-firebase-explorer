import { homedir } from 'os';
import { resolve as resolvePath } from 'path';
import { AccountInfo } from './interfaces';

export const APIforCLI = {
  clientId:
    '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  clientSecret: 'j9iVZfS8kkCEFUPaAeJV0sAi'
};

export function getCliAccount(): AccountInfo | null {
  let cachedConfig: any;

  try {
    const config = require(resolvePath(
      homedir(),
      '.config/configstore/firebase-tools.json'
    ));
    // cachedToken = config.tokens.refresh_token;
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

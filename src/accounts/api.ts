import * as request from 'request-promise-native';
import { contains } from '../utils';
import { CLI_API_CONFIG } from './cli';
import { AccountInfo, GoogleOAuthAccessToken } from './manager';

export const API_CONFIG = {
  authOrigin: 'https://accounts.google.com',
  refreshTokenHost: 'www.googleapis.com',
  refreshTokenPath: '/oauth2/v4/token'
};

const instances: { [k: string]: AccountsAPI } = {};

export class AccountsAPI {
  static for(accountInfo: AccountInfo): AccountsAPI {
    const id = accountInfo.user.email;

    if (!contains(instances, id)) {
      instances[id] = new AccountsAPI(accountInfo);
    }

    return instances[id];
  }

  private constructor(public accountInfo: AccountInfo) {}

  async getAccessToken(): Promise<GoogleOAuthAccessToken> {
    const reqOptions: request.OptionsWithUrl = {
      method: 'POST',
      url: `https://${API_CONFIG.refreshTokenHost}${
        API_CONFIG.refreshTokenPath
      }`,
      formData: {
        grant_type: 'refresh_token',
        refresh_token: this.accountInfo.tokens.refresh_token,
        client_id:
          this.accountInfo.origin === 'cli'
            ? CLI_API_CONFIG.clientId
            : /*API_CONFIG*/ CLI_API_CONFIG.clientId,
        client_secret:
          this.accountInfo.origin === 'cli'
            ? CLI_API_CONFIG.clientSecret
            : /*API_CONFIG*/ CLI_API_CONFIG.clientSecret
      },
      resolveWithFullResponse: true
    };

    let resp: request.FullResponse;

    try {
      resp = await request(reqOptions);
    } catch (err) {
      const error = JSON.parse(err.error);
      let message = 'Error fetching access token: ' + error.error;
      if (error.error_description) {
        message += ' (' + error.error_description + ')';
      }
      throw new Error(message);
    }

    const token: GoogleOAuthAccessToken = JSON.parse(resp.body);
    if (!token.access_token || !token.expires_in) {
      throw new Error(
        `Unexpected response while fetching access token: ${resp.body}`
      );
    } else {
      return token;
    }
  }
}

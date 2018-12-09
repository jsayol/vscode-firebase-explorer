import * as request from 'request-promise-native';
import { contains, getContextObj } from '../utils';
import { APIforCLI } from './cli';
import { API } from './login';
import { FirebaseProject } from '../projects/ProjectManager';
import { ProjectsAPI } from '../projects/api';

const instances: { [k: string]: AccountManager } = {};

export class AccountManager {
  static for(account: AccountInfo): AccountManager {
    const id = account.user.email;
    if (!contains(instances, id)) {
      instances[id] = new AccountManager(account);
    }
    return instances[id];
  }

  static getAccounts(): AccountInfo[] {
    const context = getContextObj();
    let accounts = context.globalState.get<AccountInfo[]>('accounts');

    if (!Array.isArray(accounts)) {
      accounts = [];
    }

    return accounts;
  }

  static setAccounts(accounts: AccountInfo[]): Thenable<void> {
    const context = getContextObj();
    return context.globalState.update('accounts', accounts);
  }

  /**
   * Adds a new account information to the config.
   * If an account already exists for that email, it gets replaced.
   */
  static addAccount(account: AccountInfo) {
    const accounts = AccountManager.getAccounts().filter(
      acc => acc.user.email !== account.user.email
    );
    accounts.push(account);
    return AccountManager.setAccounts(accounts);
  }

  static removeAccount(account: AccountInfo) {
    const accounts = AccountManager.getAccounts().filter(
      acc => acc.user.email !== account.user.email
    );
    return AccountManager.setAccounts(accounts);
  }

  private cachedAccessToken: {
    token: GoogleOAuthAccessToken;
    expirationTime: number;
  } | null = null;

  private constructor(readonly account: AccountInfo) {}

  getRefreshToken(): string {
    return this.account.tokens.refresh_token;
  }

  private isCachedTokenValid(): boolean {
    if (!this.cachedAccessToken) {
      return false;
    }

    return Date.now() < this.cachedAccessToken.expirationTime;
  }

  async getAccessToken(): Promise<GoogleOAuthAccessToken> {
    if (this.isCachedTokenValid()) {
      return this.cachedAccessToken!.token;
    }

    const reqOptions: request.OptionsWithUrl = {
      method: 'POST',
      url: `https://${API.refreshTokenHost}${API.refreshTokenPath}`,
      formData: {
        grant_type: 'refresh_token',
        refresh_token: this.account.tokens.refresh_token,
        client_id:
          this.account.origin === 'cli' ? APIforCLI.clientId : API.clientId,
        client_secret:
          this.account.origin === 'cli'
            ? APIforCLI.clientSecret
            : API.clientSecret
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
      this.cachedAccessToken = {
        token,
        expirationTime: Date.now() + 1000 * token.expires_in
      };
      return token;
    }
  }

  getEmail(): string {
    return this.account.user.email;
  }

  async listProjects(): Promise<FirebaseProject[]> {
    try {
      const projectsAPI = ProjectsAPI.for(this.account);
      const list: FirebaseProject[] = await projectsAPI.listProjects();
      return list;
      // return list.filter(
      //   project =>
      //     [
      //       'Firebase Demo Project',
      //       'Personal Project',
      //       'firestore-sql-test',
      //       'fb-js-samples',
      //       'js-sdk-persistence'
      //     ].indexOf(project.displayName) !== -1
      // );
    } catch (err) {
      console.error({ err });
      return [];
    }
  }
}

export interface GoogleOAuthAccessToken {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

export interface AccountInfo {
  user: AccountUser;
  tokens: AccountTokens;
  origin: 'login' | 'cli';
}

export interface AccountUser {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: true;
  at_hash: string;
  iat: number;
  exp: number;
}

export interface AccountTokens {
  expires_at: number;
  refresh_token: string;
  scopes: string[];
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

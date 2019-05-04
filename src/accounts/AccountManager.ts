import * as request from 'request-promise-native';
import { Url } from 'url';
import { contains, getContext } from '../utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { ProjectsAPI } from '../projects/api';
import { AccountsAPI } from './api';

const RETRY_DELAY = 1000; // ms
const instances: { [k: string]: AccountManager } = {};

export class AccountManager {
  static for(account: AccountInfo): AccountManager {
    const id = account.user.email;
    if (!contains(instances, id)) {
      instances[id] = new AccountManager(account);
    }
    return instances[id];
  }

  static forSelectedAccount(): AccountManager {
    const context = getContext();
    const account = context.globalState.get<AccountInfo>('selectedAccount');

    if (!account) {
      throw new Error('No selected account');
    }

    return AccountManager.for(account);
  }

  static getAccounts(): AccountInfo[] {
    const context = getContext();
    let accounts = context.globalState.get<AccountInfo[]>('accounts');

    if (!Array.isArray(accounts)) {
      accounts = [];
    }

    return accounts;
  }

  static setAccounts(accounts: AccountInfo[]): Thenable<void> {
    const context = getContext();
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

  projectsList: FirebaseProject[] | null = null;

  private constructor(readonly account: AccountInfo) {}

  async request(
    method: string,
    url: string | Url,
    options: RequestOptions = {}
  ): Promise<request.FullResponse> {
    const token = await this.getAccessToken();
    const { retryOn } = options;
    delete options.retryOn;

    const reqOptions: request.OptionsWithUrl = {
      method,
      url,
      resolveWithFullResponse: true,
      json: true,
      ...options
    };

    reqOptions.headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      'X-Client-Version': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      ...options.headers
    };

    try {
      return request(reqOptions);
    } catch (err) {
      if (Array.isArray(retryOn) && retryOn.includes(err.statusCode)) {
        return new Promise(resolve => {
          setTimeout(resolve, RETRY_DELAY);
        }).then(() => this.request(method, url, { ...options, retryOn }));
      } else {
        throw err;
      }
    }
  }

  getRefreshToken(): string {
    return this.account.tokens.refresh_token;
  }

  async getAccessToken(): Promise<string> {
    if (this.isCachedTokenValid()) {
      return this.account.tokens.access_token;
    }

    const tokens = await AccountsAPI.for(this.account).getAccessToken();

    this.account.tokens = {
      ...this.account.tokens,
      ...tokens,
      expires_at: Date.now() + 1000 * tokens.expires_in
    };

    return tokens.access_token;
  }

  private isCachedTokenValid(): boolean {
    if (!this.account.tokens.access_token) {
      return false;
    }

    return Date.now() < this.account.tokens.expires_at;
  }

  getEmail(): string {
    return this.account.user.email;
  }

  async listProjects({ refresh = true } = {}): Promise<FirebaseProject[]> {
    if (refresh || !this.projectsList) {
      try {
        const projectsAPI = ProjectsAPI.for(this.account);
        this.projectsList = await projectsAPI.listProjects();
      } catch (err) {
        console.error({ err });
        return [];
      }
    }

    return this.projectsList;
  }

  listProjectsSync(): FirebaseProject[] | null {
    return this.projectsList;
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
  email_verified: boolean;
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

export type RequestOptions = Partial<request.OptionsWithUrl> & {
  retryOn?: number[];
};

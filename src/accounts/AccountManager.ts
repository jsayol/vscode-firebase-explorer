import { Url } from 'url';
import * as request from 'request-promise-native';
import { FirebaseProject } from '../projects/ProjectManager';
import { contains, getContext } from '../utils';
import { ProjectsAPI } from '../projects/api';
import { AccountsAPI } from './api';

const RETRY_DELAY = 1000; // ms

const state: {
  accounts?: StateAccounts;
  instances: { [email: string]: AccountManager };
} = {
  instances: {}
};

function getStateAccounts(): StateAccounts {
  if (!state.accounts) {
    state.accounts =
      getContext().globalState.get<StateAccounts>('accounts') || {};
  }
  return state.accounts;
}

function setStateAccounts(accounts: StateAccounts): Thenable<void> {
  state.accounts = accounts;
  return getContext().globalState.update('accounts', accounts);
}

export class AccountManager {
  static for(info: AccountInfo): AccountManager {
    const email = info.user.email;

    if (!contains(state.instances, email)) {
      state.instances[email] = new AccountManager(info);
    }

    return state.instances[email];
  }

  static forSelectedAccount(): AccountManager {
    const info = AccountManager.getSelectedAccountInfo();

    if (!info) {
      throw new Error('No selected account');
    }

    return AccountManager.for(info);
  }

  static getInfoForEmail(email: string): AccountInfo | null {
    const accounts = getStateAccounts();
    return contains(accounts, email) ? accounts[email].info : null;
  }

  static getAccounts(): AccountData[] {
    return Object.values(getStateAccounts());
  }

  static getSelectedAccountInfo(): AccountInfo | null {
    return getContext().globalState.get('selectedAccount') || null;
  }

  /**
   * Adds a new account information to the config.
   * If an account already exists for that email, it gets replaced.
   */
  static addAccount(accountInfo: AccountInfo): Thenable<void> {
    const accounts = getStateAccounts();

    accounts[accountInfo.user.email] = {
      info: accountInfo,
      projects: []
    };

    return setStateAccounts(accounts);
  }

  /**
   * Removes an account from the config.
   */
  static removeAccount(accountInfo: AccountInfo): Thenable<void> {
    const email = accountInfo.user.email;
    const accounts = getStateAccounts();
    delete accounts[email];
    delete state.instances[email];
    return setStateAccounts(accounts);
  }

  private accountData: AccountData;

  private constructor(info: AccountInfo) {
    const accounts = getStateAccounts();
    this.accountData = accounts[info.user.email];
  }

  private saveAccountData(): Thenable<void> {
    const accounts = getStateAccounts();
    accounts[this.accountData.info.user.email] = this.accountData;
    return setStateAccounts(accounts);
  }

  get info(): AccountInfo {
    return this.accountData.info;
  }

  get email(): string {
    return this.accountData.info.user.email;
  }

  remove(): Thenable<void> {
    const accounts = getStateAccounts();
    delete accounts[this.accountData.info.user.email];
    return setStateAccounts(accounts);
  }

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
    return this.accountData.info.tokens.refresh_token;
  }

  async getAccessToken(): Promise<string> {
    if (this.isCachedTokenValid()) {
      return this.accountData.info.tokens.access_token;
    }

    const tokens = await AccountsAPI.for(
      this.accountData.info
    ).getAccessToken();

    this.accountData.info.tokens = {
      ...this.accountData.info.tokens,
      ...tokens,
      expires_at: Date.now() + 1000 * tokens.expires_in
    };

    this.saveAccountData();

    return tokens.access_token;
  }

  private isCachedTokenValid(): boolean {
    if (!this.accountData.info.tokens.access_token) {
      return false;
    }

    return Date.now() < this.accountData.info.tokens.expires_at;
  }

  getEmail(): string {
    return this.accountData.info.user.email;
  }

  async listProjects(): Promise<FirebaseProject[]> {
    if (!this.accountData.projects) {
      try {
        const projectsAPI = ProjectsAPI.for(this.accountData.info);
        this.accountData.projects = await projectsAPI.listProjects();
        this.saveAccountData();
      } catch (err) {
        console.error({ err });
        return this.listProjectsSync() || [];
      }
    }

    return this.accountData.projects;
  }

  listProjectsSync(): FirebaseProject[] | null {
    return this.accountData.projects || null;
  }
}

export interface GoogleOAuthAccessToken {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

export interface StateAccounts {
  [email: string]: AccountData;
}

export interface AccountData {
  info: AccountInfo;
  projects: FirebaseProject[] | null | undefined;
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

import { contains, getContextObj } from '../utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { ProjectsAPI } from '../projects/api';
import { AccountsAPI } from './api';
import { ProjectStore } from '../projects/ProjectStore';

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
    const context = getContextObj();
    const account = context.globalState.get<AccountInfo>('selectedAccount');

    if (!account) {
      throw new Error('No selected account');
    }

    return AccountManager.for(account);
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

  projects = new ProjectStore();

  private constructor(readonly account: AccountInfo) {}

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

  async listProjects(): Promise<FirebaseProject[]> {
    try {
      const projectsAPI = ProjectsAPI.for(this.account);
      const list: FirebaseProject[] = await projectsAPI.listProjects();
      return list;
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

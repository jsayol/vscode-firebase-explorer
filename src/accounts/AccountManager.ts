import * as firebaseAdmin from 'firebase-admin';
import { AccountInfo } from './interfaces';
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

  readonly credential: firebaseAdmin.credential.Credential;

  private constructor(readonly account: AccountInfo) {
    this.credential = firebaseAdmin.credential.refreshToken({
      type: 'authorized_user',
      refresh_token: account.tokens.refresh_token,
      client_id: account.origin === 'cli' ? APIforCLI.clientId : API.clientId,
      client_secret:
        account.origin === 'cli' ? APIforCLI.clientSecret : API.clientSecret
    });
  }

  getRefreshToken(): string {
    return this.account.tokens.refresh_token;
  }

  getAccessToken(): Promise<GoogleOAuthAccessToken> {
    return this.credential.getAccessToken() as any;
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

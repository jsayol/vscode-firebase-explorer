import * as firebaseAdmin from 'firebase-admin';
import { AccountInfo } from './interfaces';
import { contains } from '../utils';
import { APIforCLI } from './cli';
import { API } from './login';
import { FirebaseProject } from '../projects/ProjectManager';
const firebaseTools = require('firebase-tools');

const instances: { [k: string]: AccountManager } = {};

export class AccountManager {
  static for(account: AccountInfo): AccountManager {
    const id = account.user.email;
    if (!contains(instances, id)) {
      instances[id] = new AccountManager(account);
    }
    return instances[id];
  }

  readonly credential: firebaseAdmin.credential.Credential;

  private constructor(private readonly account: AccountInfo) {
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

  getAccessToken(): Promise<firebaseAdmin.GoogleOAuthAccessToken> {
    return this.credential.getAccessToken();
  }

  async listProjects(): Promise<FirebaseProject[]> {
    const token = this.account.tokens.refresh_token;
    const list: FirebaseProject[] = await firebaseTools.list({ token });
    // return list;
    return list.filter(
      project =>
        [
          'Firebase Demo Project',
          'Personal Project',
          'firestore-sql-test',
          'fb-js-samples',
          'js-sdk-persistence'
        ].indexOf(project.name) !== -1
    );
  }
}

import * as firebaseAdmin from 'firebase-admin';
import { AccountInfo } from './accounts/interfaces';
import { contains } from './utils';
import { AccountManager } from './accounts/AccountManager';
const firebaseTools = require('firebase-tools');

const instances: { [k: string]: ProjectManager } = {};

export class ProjectManager {
  static for(account: AccountInfo, project: FirebaseProject): ProjectManager {
    const id = account.user.email + '--' + project.id;
    if (!contains(instances, id)) {
      instances[id] = new ProjectManager(account, project);
    }
    return instances[id];
  }

  readonly accountManager: AccountManager;
  private firebaseApp?: firebaseAdmin.app.App;
  private initialized: Promise<void>;
  private apps?: ProjectApps;
  private id: string;

  private constructor(
    account: AccountInfo,
    public readonly project: FirebaseProject
  ) {
    this.id = account.user.email + '--' + project.id;
    this.accountManager = AccountManager.for(account);
    this.initialized = this.getConfig().then(config => {
      this.firebaseApp = firebaseAdmin.initializeApp(
        {
          ...config,
          credential: this.accountManager.credential
        },
        this.id
      );
    });
  }

  getAccessToken(): Promise<firebaseAdmin.GoogleOAuthAccessToken> {
    return this.accountManager.getAccessToken();
  }

  getConfig(): Promise<firebaseAdmin.AppOptions> {
    return firebaseTools.setup.web({
      project: this.project.id,
      token: this.accountManager.getRefreshToken()
    });
  }

  async listApps(): Promise<ProjectApps> {
    if (!this.apps) {
      await this.initialized;

      const management = firebaseAdmin.projectManagement(this.firebaseApp);
      const apps = await Promise.all([
        management.listIosApps(),
        management.listAndroidApps()
      ]);

      const projectApps = await Promise.all([
        Promise.all(
          apps[0].map(async iosApp => {
            const metadata = await iosApp.getMetadata();
            return { app: iosApp, metadata };
          })
        ),
        Promise.all(
          apps[1].map(async androidApp => {
            const metadata = await androidApp.getMetadata();
            return { app: androidApp, metadata };
          })
        )
      ]);

      this.apps = {
        ios: projectApps[0],
        android: projectApps[1]
      };
    }

    return this.apps!;
  }
}

export interface IosApp {
  app: firebaseAdmin.projectManagement.IosApp;
  metadata: firebaseAdmin.projectManagement.IosAppMetadata;
}

export interface AndroidApp {
  app: firebaseAdmin.projectManagement.AndroidApp;
  metadata: firebaseAdmin.projectManagement.AndroidAppMetadata;
}

export interface ProjectApps {
  ios: IosApp[];
  android: AndroidApp[];
}

export interface ProjectAppsMetadata {
  ios: firebaseAdmin.projectManagement.IosAppMetadata[];
  android: firebaseAdmin.projectManagement.AndroidAppMetadata[];
}

export interface FirebaseProject {
  name: string;
  id: string;
  permission: string;
  instance: string;
}

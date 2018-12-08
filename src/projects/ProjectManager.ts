import * as firebaseAdmin from 'firebase-admin';
import { AccountInfo } from '../accounts/interfaces';
import { contains, setContext, ContextValue } from '../utils';
import { AccountManager } from '../accounts/AccountManager';
import { listProjects } from './api';
const firebaseTools = require('firebase-tools');

const instances: { [k: string]: ProjectManager } = {};

export class ProjectManager {
  static for(account: AccountInfo, project: FirebaseProject): ProjectManager {
    const id = account.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new ProjectManager(account, project);
    }
    return instances[id];
  }

  static getProjectsFor(account: AccountInfo): Promise<FirebaseProject[]> {
    return listProjects(account);
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
    this.id = account.user.email + '--' + project.projectId;
    this.accountManager = AccountManager.for(account);
    this.initialized = this.retrieveConfig().then(config => {
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

  async getConfig(): Promise<firebaseAdmin.AppOptions> {
    await this.initialized;
    return this.firebaseApp!.options;
  }

  async listApps(forceRefresh = false): Promise<ProjectApps> {
    try {
      if (!this.apps || forceRefresh) {
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

      setContext(ContextValue.AppsLoaded, true);

      return this.apps!;
    } catch (err) {
      // TODO: handle error
      console.error({ err });
      return {
        ios: [],
        android: []
      };
    }
  }

  private retrieveConfig(): Promise<firebaseAdmin.AppOptions> {
    return firebaseTools.setup.web({
      project: this.project.projectId,
      token: this.accountManager.getRefreshToken()
    });
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
  displayName: string;
  projectId: string;
  projectNumber: string;
  resources: {
    hostingSite: string;
    realtimeDatabaseInstance: string;
    storageBucket: string;
    locationId: string;
  };
}

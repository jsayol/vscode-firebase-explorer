import { contains, setContext, ContextValue } from '../utils';
import {
  AccountManager,
  GoogleOAuthAccessToken,
  AccountInfo
} from '../accounts/AccountManager';
import { IosApp, AndroidApp } from '../apps/apps';
import { ProjectsAPI } from './api';
import { AppsAPI } from '../apps/api';

const instances: { [k: string]: ProjectManager } = {};

export class ProjectManager {
  static for(account: AccountInfo, project: FirebaseProject): ProjectManager {
    const id = account.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new ProjectManager(account, project);
    }
    return instances[id];
  }

  readonly accountManager: AccountManager;
  private config?: ProjectConfig;
  private apps?: ProjectApps;

  private constructor(
    account: AccountInfo,
    public readonly project: FirebaseProject
  ) {
    this.accountManager = AccountManager.for(account);
  }

  getAccessToken(): Promise<GoogleOAuthAccessToken> {
    return this.accountManager.getAccessToken();
  }

  async getConfig(): Promise<ProjectConfig> {
    if (!this.config) {
      const api = ProjectsAPI.for(this.accountManager.account);
      this.config = await api.getProjectConfig(this.project);
    }
    return this.config;
  }

  async listApps(forceRefresh = false): Promise<ProjectApps> {
    try {
      if (!this.apps || forceRefresh) {
        const apps = await Promise.all([
          this.listIosApps(),
          this.listAndroidApps()
        ]);

        this.apps = {
          ios: apps[0],
          android: apps[1]
        };
      }

      setContext(ContextValue.AppsLoaded, true);
      return this.apps;
    } catch (err) {
      // TODO: handle error
      console.error('apps', { err });
      console.log((err as Error).stack);
      return {
        ios: [],
        android: []
      };
    }
  }

  // async listApps_old(forceRefresh = false): Promise<ProjectApps> {
  //   try {
  //     if (!this.apps || forceRefresh) {
  //       await this.initialized;

  //       const management = firebaseAdmin.projectManagement(this.firebaseApp);
  //       const apps = await Promise.all([
  //         management.listIosApps(),
  //         management.listAndroidApps()
  //       ]);

  //       const projectApps = await Promise.all([
  //         Promise.all(
  //           apps[0].map(async iosApp => {
  //             const metadata = await iosApp.getMetadata();
  //             return { app: iosApp, metadata };
  //           })
  //         ),
  //         Promise.all(
  //           apps[1].map(async androidApp => {
  //             const metadata = await androidApp.getMetadata();
  //             return { app: androidApp, metadata };
  //           })
  //         )
  //       ]);

  //       this.apps = {
  //         ios: projectApps[0],
  //         android: projectApps[1]
  //       };
  //     }

  //     setContext(ContextValue.AppsLoaded, true);

  //     return this.apps!;
  //   } catch (err) {
  //     // TODO: handle error
  //     console.error('apps', { err });
  //     return {
  //       ios: [],
  //       android: []
  //     };
  //   }
  // }

  private async listIosApps(): Promise<IosApp[]> {
    const api = AppsAPI.for(this.accountManager.account, this.project);
    const apps = await api.listIosApps(this.project.projectId);
    return apps.map(
      props => new IosApp(this.accountManager.account, this.project, props)
    );
  }

  private async listAndroidApps(): Promise<AndroidApp[]> {
    const api = AppsAPI.for(this.accountManager.account, this.project);
    const apps = await api.listAndroidApps(this.project.projectId);
    return apps.map(
      props => new AndroidApp(this.accountManager.account, this.project, props)
    );
  }
}

// export interface IosApp {
//   app: firebaseAdmin.projectManagement.IosApp;
//   metadata: firebaseAdmin.projectManagement.IosAppMetadata;
// }

// export interface AndroidApp {
//   app: firebaseAdmin.projectManagement.AndroidApp;
//   metadata: firebaseAdmin.projectManagement.AndroidAppMetadata;
// }

export interface ProjectApps {
  ios: IosApp[];
  android: AndroidApp[];
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

export interface ProjectConfig {
  projectId: string;
  databaseURL: string;
  storageBucket: string;
  locationId: string;
}

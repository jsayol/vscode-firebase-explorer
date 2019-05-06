import { contains, setContext, ContextValue } from '../utils';
import { AccountManager, AccountInfo } from '../accounts/manager';
import { IosApp, AndroidApp } from '../apps/apps';
import { ProjectsAPI } from './api';
import { AppsAPI } from '../apps/api';

const instances: { [k: string]: ProjectManager } = {};

export class ProjectManager {
  static for(
    infoOrEmail: AccountInfo | string,
    projectOrId: FirebaseProject | string
  ): ProjectManager {
    let accountInfo: AccountInfo;
    let project: FirebaseProject;

    if (typeof infoOrEmail === 'string') {
      // "account" is an email, let's find the AccountInfo.
      const foundInfo = AccountManager.getInfoForEmail(infoOrEmail);

      if (!foundInfo) {
        throw new Error('Account not found for email ' + infoOrEmail);
      }

      accountInfo = foundInfo;
    } else {
      accountInfo = infoOrEmail;
    }

    if (typeof projectOrId === 'string') {
      // "projectOrId" is the projectId, let's find the FirebaseProject.
      const projects = AccountManager.for(accountInfo).listProjectsSync();

      if (!projects) {
        throw new Error('No projects found for email ' + infoOrEmail);
      }

      const foundProject = projects.find(
        _project => _project.projectId === projectOrId
      );

      if (!foundProject) {
        throw new Error('Project not found for projectId ' + projectOrId);
      }

      project = foundProject;
    } else {
      project = projectOrId;
    }

    const id = accountInfo.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new ProjectManager(accountInfo, project);
    }
    return instances[id];
  }

  readonly accountManager: AccountManager;
  private config?: ProjectConfig;
  private webAppConfig?: WebAppConfig;
  private apps?: ProjectApps;

  private constructor(
    accountInfo: AccountInfo,
    public readonly project: FirebaseProject
  ) {
    this.accountManager = AccountManager.for(accountInfo);
  }

  getAccessToken(): Promise<string> {
    return this.accountManager.getAccessToken();
  }

  async getConfig(): Promise<ProjectConfig> {
    if (!this.config) {
      const api = ProjectsAPI.for(this.accountManager.info);
      this.config = await api.getProjectConfig(this.project);
    }
    return this.config;
  }

  async getWebAppConfig(): Promise<WebAppConfig> {
    if (!this.webAppConfig) {
      const api = ProjectsAPI.for(this.accountManager.info);
      this.webAppConfig = await api.getWebAppConfig(this.project);
    }
    return this.webAppConfig;
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

  private async listIosApps(): Promise<IosApp[]> {
    const api = AppsAPI.for(this.accountManager.info, this.project);
    const apps = await api.listIosApps(this.project.projectId);
    return apps.map(
      props => new IosApp(this.accountManager.info, this.project, props)
    );
  }

  private async listAndroidApps(): Promise<AndroidApp[]> {
    const api = AppsAPI.for(this.accountManager.info, this.project);
    const apps = await api.listAndroidApps(this.project.projectId);
    return apps.map(
      props => new AndroidApp(this.accountManager.info, this.project, props)
    );
  }
}

export interface ProjectApps {
  ios: IosApp[];
  android: AndroidApp[];
}

export interface FirebaseProject {
  projectId: string;
  projectNumber: string;
  displayName: string;
}

export interface ProjectConfig {
  projectId: string;
  databaseURL: string;
  storageBucket: string;
  locationId: string;
}

export interface ProjectInfo {
  projectId: string;
  displayName: string;
  locationId: string;
}

export interface WebAppConfig {
  apiKey: string;
  databaseURL: string;
  storageBucket: string;
  authDomain: string;
  messagingSenderId: string;
  projectId: string;
}

import { FirebaseProject } from '../projects/ProjectManager';
import * as projectsApi from '../projects/api';
import { AccountManager } from '../accounts/AccountManager';

export interface AndroidAppProps {
  name: string;
  appId: string;
  displayName: string;
  projectId: string;
  packageName: string;
}

export interface IosAppProps {
  name: string;
  appId: string;
  displayName: string;
  projectId: string;
  bundleId: string;
}

class BaseApp {
  name: string;
  appId: string;
  displayName: string;
  projectId: string;

  constructor(
    protected accountManager: AccountManager,
    protected project: FirebaseProject,
    props: { [k: string]: any }
  ) {
    this.name = props.name;
    this.appId = props.appId;
    this.displayName = props.displayName;
    this.projectId = props.projectId;
  }

  async setDisplayName(type: string, name: string): Promise<void> {
    // TODO
    type;
    name;
  }

  getConfig(type: string): Promise<string | undefined> {
    return projectsApi.getAppConfig(
      type,
      this.accountManager,
      this.projectId,
      this.appId
    );
  }
}

export class IosApp extends BaseApp {
  bundleId: string;

  constructor(
    accountManager: AccountManager,
    project: FirebaseProject,
    props: IosAppProps
  ) {
    super(accountManager, project, props);
    this.bundleId = props.bundleId;
  }

  async setDisplayName(name: string): Promise<void> {
    return super.setDisplayName('ios', name);
  }

  async getConfig(): Promise<string | undefined> {
    return super.getConfig('ios');
  }
}

export class AndroidApp extends BaseApp {
  packageName: string;

  constructor(
    accountManager: AccountManager,
    project: FirebaseProject,
    props: AndroidAppProps
  ) {
    super(accountManager, project, props);
    this.packageName = props.packageName;
  }

  async setDisplayName(name: string): Promise<void> {
    return super.setDisplayName('android', name);
  }

  async getConfig(): Promise<string | undefined> {
    return super.getConfig('android');
  }

  async getShaCertificates(): Promise<ShaCertificate[]> {
    // TODO
    return [];
  }

  async addShaCertificate(certificateToAdd: ShaCertificate): Promise<void> {
    // TODO
    certificateToAdd;
  }
  async deleteShaCertificate(
    certificateToRemove: ShaCertificate
  ): Promise<void> {
    // TODO
    certificateToRemove;
  }
}

export interface ShaCertificate {
  certType: 'sha1' | 'sha256';
  shaHash: string;
  resourceName?: string;
}

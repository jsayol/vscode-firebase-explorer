import { FirebaseProject } from '../projects/ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import {
  setDisplayName,
  getAppConfig,
  getShaCertificates,
  addShaCertificate,
  deleteShaCertificate
} from '../projects/api';

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

  protected async _setDisplayName(
    type: string,
    name: string
  ): Promise<IosAppProps | AndroidAppProps | undefined> {
    const newProps = await setDisplayName(
      type,
      this.accountManager,
      this.appId,
      name
    );

    if (newProps) {
      this.name = newProps.name;
      this.appId = newProps.appId;
      this.displayName = newProps.displayName;
      this.projectId = newProps.projectId;
    }

    return newProps;
  }

  getConfig(type: string): Promise<string | undefined> {
    return getAppConfig(type, this.accountManager, this.appId);
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

  get appName(): string {
    return this.displayName || this.bundleId;
  }

  async setDisplayName(name: string): Promise<void> {
    const newProps = await super._setDisplayName('ios', name);
    if (newProps) {
      this.bundleId = (newProps as IosAppProps).bundleId;
    }
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

  get appName(): string {
    return this.displayName || this.packageName;
  }

  async setDisplayName(name: string): Promise<void> {
    const newProps = await super._setDisplayName('android', name);
    if (newProps) {
      this.packageName = (newProps as AndroidAppProps).packageName;
    }
  }

  async getConfig(): Promise<string | undefined> {
    return super.getConfig('android');
  }

  getShaCertificates(): Promise<ShaCertificate[]> {
    return getShaCertificates(this.accountManager, this.appId);
  }

  async addShaCertificate(cert: ShaCertificate): Promise<void> {
    addShaCertificate(this.accountManager, this.appId, cert);
  }

  async deleteShaCertificate(cert: ShaCertificate): Promise<void> {
    deleteShaCertificate(this.accountManager, this.appId, cert);
  }
}

export interface ShaCertificate {
  name?: string;
  certType: 'SHA_1' | 'SHA_256';
  shaHash: string;
}

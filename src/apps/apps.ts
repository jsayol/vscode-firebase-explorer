import { FirebaseProject } from '../projects/manager';
import { AppsAPI } from './api';
import { AccountInfo } from '../accounts/manager';

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
    protected accountInfo: AccountInfo,
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
    const api = AppsAPI.for(this.accountInfo, this.project);
    const newProps = await api.setDisplayName(type, this.appId, name);

    if (newProps) {
      this.name = newProps.name;
      this.appId = newProps.appId;
      this.displayName = newProps.displayName;
      this.projectId = newProps.projectId;
    }

    return newProps;
  }

  getConfig(type: string): Promise<string | undefined> {
    const api = AppsAPI.for(this.accountInfo, this.project);
    return api.getAppConfig(type, this.appId);
  }
}

export class IosApp extends BaseApp {
  bundleId: string;

  constructor(
    accountInfo: AccountInfo,
    project: FirebaseProject,
    props: IosAppProps
  ) {
    super(accountInfo, project, props);
    this.bundleId = props.bundleId;
  }

  get appName(): string {
    return this.displayName || this.bundleId;
  }

  async setDisplayName(name: string): Promise<boolean> {
    const newProps = await super._setDisplayName('ios', name);
    if (newProps) {
      this.bundleId = (newProps as IosAppProps).bundleId;
    }

    return !!newProps;
  }

  async getConfig(): Promise<string | undefined> {
    return super.getConfig('ios');
  }
}

export class AndroidApp extends BaseApp {
  packageName: string;

  constructor(
    accountInfo: AccountInfo,
    project: FirebaseProject,
    props: AndroidAppProps
  ) {
    super(accountInfo, project, props);
    this.packageName = props.packageName;
  }

  get appName(): string {
    return this.displayName || this.packageName;
  }

  async setDisplayName(name: string): Promise<boolean> {
    const newProps = await super._setDisplayName('android', name);
    if (newProps) {
      this.packageName = (newProps as AndroidAppProps).packageName;
    }

    return !!newProps;
  }

  async getConfig(): Promise<string | undefined> {
    return super.getConfig('android');
  }

  getShaCertificates(): Promise<ShaCertificate[]> {
    const api = AppsAPI.for(this.accountInfo, this.project);
    return api.getShaCertificates(this.appId);
  }

  async addShaCertificate(cert: ShaCertificate): Promise<void> {
    const api = AppsAPI.for(this.accountInfo, this.project);
    await api.addShaCertificate(this.appId, cert);
  }

  async deleteShaCertificate(cert: ShaCertificate): Promise<void> {
    const api = AppsAPI.for(this.accountInfo, this.project);
    await api.deleteShaCertificate(this.appId, cert);
  }
}

export interface ShaCertificate {
  name?: string;
  certType: 'SHA_1' | 'SHA_256';
  shaHash: string;
}

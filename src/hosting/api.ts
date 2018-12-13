import * as request from 'request-promise-native';
import { AccountInfo, AccountManager } from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { contains } from '../utils';

// https://developers.google.com/apis-explorer/#search/firebase%20hosting/firebasehosting/v1beta1/

const CONFIG = {
  version: 'v1beta1',
  origin: 'https://firebasehosting.googleapis.com',
  mobilesdk: {
    version: 'v1',
    origin: 'https://mobilesdk-pa.googleapis.com'
  }
};

const instances: { [k: string]: HostingAPI } = {};

const fileListCache: { [k: string]: HostingReleaseVersionFile[] } = {};

export class HostingAPI {
  static for(account: AccountInfo, project: FirebaseProject): HostingAPI {
    const id = account.user.email + '--' + project.projectId;

    if (!contains(instances, id)) {
      instances[id] = new HostingAPI(account, project);
    }

    return instances[id];
  }

  accountManager: AccountManager;

  private constructor(account: AccountInfo, public project: FirebaseProject) {
    this.accountManager = AccountManager.for(account);
  }

  private async authedRequest(
    method: string,
    resource: string,
    options: Partial<request.OptionsWithUrl> = {}
  ) {
    const token = await this.accountManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method,
      url: `${CONFIG.origin}/${CONFIG.version}/${resource}`,
      resolveWithFullResponse: true,
      json: true,
      ...options
    };

    reqOptions.headers = {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      'X-Client-Version': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      ...options.headers
    };

    return request(reqOptions);
  }

  async listSites(): Promise<HostingSite[]> {
    const response = await this.authedRequest('GET', '', {
      url: `${CONFIG.mobilesdk.origin}/${CONFIG.mobilesdk.version}/projects/${
        this.project.projectNumber
      }/hosting`
    });
    return response.body.site || [];
  }

  async listReleases(site: string): Promise<HostingRelease[]> {
    const resource = `sites/${site}/releases`;
    const response = await this.authedRequest('GET', resource);
    return response.body.releases || [];
  }

  async listDomains(site: string): Promise<HostingDomain[]> {
    const resource = `sites/${site}/domains`;
    const response = await this.authedRequest('GET', resource);
    return response.body.domains || [];
  }

  async listFiles(version: string): Promise<HostingReleaseVersionFile[]> {
    if (!/^sites\/([^\/]+)\/versions\/([^\/]+)/.test(version)) {
      throw new Error('Hosting: Marlformed version name: ' + version);
    }

    if (!contains(fileListCache, version)) {
      const resource = `${version}/files`;
      const response = await this.authedRequest('GET', resource);
      fileListCache[version] = response.body.files || [];
    }

    return fileListCache[version];
  }
}

export interface HostingSite {
  projectNumber: string;
  site: string;
  type: 'DEFAULT_HOSTING_SITE' | string; // Not sure what other values can go here
}

export interface HostingRelease {
  name: string;
  version: HostingReleaseVersion;
  type: HostingReleaseType;
  releaseTime: string;
  releaseUser: HostingReleaseActingUser;
  message: string;
}

export interface HostingReleaseVersion {
  name: string;
  status: HostingVersionStatus;
  config: HostingReleaseServingConfig;
  labels: {
    [k: string]: string;
  };
  createTime: string;
  createUser: HostingReleaseActingUser;
  finalizeTime: string;
  finalizeUser: HostingReleaseActingUser;
  deleteTime: string;
  deleteUser: HostingReleaseActingUser;
  fileCount: string;
  versionBytes: string;
}

export interface HostingReleaseVersionFile {
  path: string;
  hash: string;
  status: HostingReleaseVersionFileStatus;
}

export enum HostingReleaseVersionFileStatus {
  STATUS_UNSPECIFIED = 'STATUS_UNSPECIFIED',
  EXPECTED = 'EXPECTED',
  ACTIVE = 'ACTIVE'
}

export enum HostingReleaseType {
  TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
  DEPLOY = 'DEPLOY',
  ROLLBACK = 'ROLLBACK',
  SITE_DISABLE = 'SITE_DISABLE'
}

export interface HostingReleaseActingUser {
  email: string;
  imageUrl: string | undefined;
}

export enum HostingVersionStatus {
  VERSION_STATUS_UNSPECIFIED = 'VERSION_STATUS_UNSPECIFIED',
  CREATED = 'CREATED',
  FINALIZED = 'FINALIZED',
  DELETED = 'DELETED',
  ABANDONED = 'ABANDONED'
}

export interface HostingReleaseServingConfig {
  headers: Array<{
    glob: string;
    headers: {
      [k: string]: string;
    };
  }>;
  redirects: Array<{
    glob: string;
    statusCode: number;
    location: string;
  }>;
  rewrites: Array<{
    glob: string;

    // Union field behavior can be only one of the following:
    path?: string;
    function?: string;
    // End of list of possible types for union field behavior.
  }>;
  cleanUrls: boolean;
  trailingSlashBehavior: HostingReleaseTrailingSlashBehavior;
}

export enum HostingReleaseTrailingSlashBehavior {
  TRAILING_SLASH_BEHAVIOR_UNSPECIFIED = 'TRAILING_SLASH_BEHAVIOR_UNSPECIFIED',
  ADD = 'ADD',
  REMOVE = 'REMOVE'
}

export interface HostingDomain {
  status: HostingDomainStatus;
  site: string;
  updateTime: string;
  domainName: string;
  provisioning: any; // DomainProvisioning
  domainRedirect: any; // DomainRedirect;
}

export enum HostingDomainStatus {
  DOMAIN_STATUS_UNSPECIFIED = 'DOMAIN_STATUS_UNSPECIFIED',
  DOMAIN_CHANGE_PENDING = 'DOMAIN_CHANGE_PENDING',
  DOMAIN_ACTIVE = 'DOMAIN_ACTIVE',
  DOMAIN_VERIFICATION_REQUIRED = 'DOMAIN_VERIFICATION_REQUIRED',
  DOMAIN_VERIFICATION_LOST = 'DOMAIN_VERIFICATION_LOST'
}

// https://firebasehosting.googleapis.com/$discovery/rest?version=v1beta1

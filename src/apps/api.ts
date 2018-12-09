import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { AccountManager, AccountInfo } from '../accounts/AccountManager';
import { waitUntilDone } from '../operations';
import { IosAppProps, AndroidAppProps, ShaCertificate } from './apps';

const API = {
  origin: 'https://firebase.googleapis.com',
  endpointPrefix: '/v1beta1/projects'
};

export function validateAppType(type: string): void | never {
  if (['ios', 'android'].indexOf(type) === -1) {
    throw new Error('Unsupported app type');
  }
}

const instances: { [k: string]: AppsAPI } = {};

export class AppsAPI {
  static for(account: AccountInfo, project: FirebaseProject): AppsAPI {
    const id = account.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new AppsAPI(account, project);
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
      url: API.origin + API.endpointPrefix + resource,
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

  async createApp(
    type: string,
    project: FirebaseProject,
    data: { packageName?: string; bundleId?: string }
  ): Promise<void> {
    validateAppType(type);

    try {
      const response = await this.authedRequest(
        'POST',
        `/${project.projectId}/${type}Apps`,
        { body: data }
      );

      if (response.statusCode === 200) {
        const operationName = response.body.name;
        const operation = await waitUntilDone(
          operationName,
          this.accountManager
        );
        if (!operation.error) {
          return;
        }
        console.log(operation);
      }
    } catch (err) {
      console.log('createApp ' + type, { err });
      throw err;
    }
  }

  listIosApps(projectId: string): Promise<IosAppProps[]> {
    return this.listAppsForType('ios', projectId);
  }

  listAndroidApps(projectId: string): Promise<AndroidAppProps[]> {
    return this.listAppsForType('android', projectId);
  }

  private async listAppsForType(
    type: 'ios',
    projectId: string
  ): Promise<IosAppProps[]>;
  private async listAppsForType(
    type: 'android',
    projectId: string
  ): Promise<AndroidAppProps[]>;
  private async listAppsForType(
    type: 'ios' | 'android',
    projectId: string
  ): Promise<IosAppProps[] | AndroidAppProps[]> {
    validateAppType(type);
    try {
      const response = await this.authedRequest(
        'GET',
        `/${projectId}/${type}Apps`,
        {
          qs: {
            pageSize: 100
          }
        }
      );

      if (response.statusCode === 200) {
        if (response.body && response.body.apps) {
          return response.body.apps;
        } else {
          // The project doesn't have any apps of the requested type
          return [];
        }
      }
    } catch (err) {
      console.log('ERR listAppsForType ' + type, { err });
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve the ${type} apps for ${projectId}`
    );

    return [];
  }

  async getAppConfig(type: string, appId: string): Promise<string | undefined> {
    validateAppType(type);

    try {
      const response = await this.authedRequest(
        'GET',
        `/-/${type}Apps/${appId}/config`
      );

      if (response.body && response.body.configFileContents) {
        // There's also body.configFilename
        const b64string = response.body.configFileContents;
        const buffer = Buffer.from(b64string, 'base64');
        return buffer.toString();
      }
    } catch (err) {
      console.log('getAppConfig ' + type, { err });
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve the config for app ${appId}`
    );

    return;
  }

  async getShaCertificates(appId: string): Promise<ShaCertificate[]> {
    try {
      const response = await this.authedRequest(
        'GET',
        `/-/androidApps/${appId}/sha`
      );

      if (response.statusCode === 200) {
        if (response.body && response.body.certificates) {
          return response.body.certificates;
        } else {
          return [];
        }
      }
    } catch (err) {
      console.log('getAppCertificates', { err });
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve the certificates for app ${appId}`
    );

    return [];
  }

  async addShaCertificate(appId: string, cert: ShaCertificate): Promise<void> {
    try {
      const response = await this.authedRequest(
        'POST',
        `/-/androidApps/${appId}/sha`,
        { body: cert }
      );

      if (response.statusCode === 200) {
        return;
      }
    } catch (err) {
      console.log('addShaCertificate', { err });
    }

    vscode.window.showErrorMessage(
      `Failed to add a certificate for app ${appId}`
    );
  }

  async deleteShaCertificate(
    appId: string,
    cert: ShaCertificate
  ): Promise<void> {
    try {
      const certMatch = (cert.name || '').match(
        /^projects\/([^\/]+)\/androidApps\/([^\/]+)\/sha\/([^\/]+)/
      );

      if (!certMatch || certMatch[2] !== appId) {
        throw new Error('Not a valid certificate path');
      }

      const resource = cert.name!.replace(/^projects/, '');
      const response = await this.authedRequest('DELETE', resource);

      if (response.statusCode === 200) {
        return;
      }
    } catch (err) {
      console.log('deleteShaCertificate', { err });
    }

    vscode.window.showErrorMessage(
      `Failed to delete a certificate for app ${appId}`
    );
  }

  async setDisplayName(
    type: string,
    appId: string,
    newDisplayName: string
  ): Promise<IosAppProps | AndroidAppProps | undefined> {
    validateAppType(type);

    try {
      const response = await this.authedRequest(
        'PATCH',
        `/-/${type}Apps/${appId}`,
        {
          qs: { updateMask: 'display_name' },
          body: { displayName: newDisplayName }
        }
      );

      if (response.statusCode === 200) {
        return response.body;
      }
    } catch (err) {
      console.log('setDisplayName ' + type, { err });
    }

    vscode.window.showErrorMessage(
      `Failed to set the display name for app ${appId}`
    );

    return;
  }
}

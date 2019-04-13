import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

const CONFIG = {
  mobilesdk: {
    origin: 'https://mobilesdk-pa.googleapis.com',
    version: 'v1'
  }
};

const instances: { [k: string]: DatabaseAPI } = {};

export class DatabaseAPI {
  static for(account: AccountInfo, project: FirebaseProject): DatabaseAPI {
    const id = account.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new DatabaseAPI(account, project);
    }
    return instances[id];
  }

  projectManager: ProjectManager;

  private constructor(account: AccountInfo, public project: FirebaseProject) {
    this.projectManager = ProjectManager.for(account, project);
  }

  private async authedRequest(
    method: string,
    url: string,
    options: Partial<request.OptionsWithUrl> = {}
  ) {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method,
      url,
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

  async listDatabases(): Promise<DatabaseInstance[]> {
    const response = await this.authedRequest(
      'GET',
      `${CONFIG.mobilesdk.origin}/${CONFIG.mobilesdk.version}/projects/${
        this.project.projectNumber
      }/databases`
    );
    return response.body.instance || [];
  }

  async getShallow(
    path: string,
    instance?: string
  ): Promise<DatabaseShallowValue> {
    try {
      const response = await this.authedRequest(
        'GET',
        await this.getURLForPath(path, instance),
        {
          qs: { shallow: true }
        }
      );
      return response.body;
    } catch (err) {
      if (err.statusCode && err.statusCode === 423) {
        // Database disabled
        throw err;
      } else {
        // TODO: handle error
        console.log('getShallow', err);
        return null;
      }
    }
  }

  async setValue(
    path: string,
    value: any,
    instance?: string
  ): Promise<request.FullResponse> {
    return this.authedRequest('PUT', await this.getURLForPath(path, instance), {
      body: value,
      resolveWithFullResponse: true
    });
  }

  remove(path: string, instance?: string): Promise<request.FullResponse> {
    return this.setValue(path, null, instance);
  }

  private async getURLForPath(
    path: string,
    instance?: string
  ): Promise<string> {
    let databaseURL: string;

    if (typeof instance === 'string' && instance.length > 0) {
      databaseURL = `https://${instance}.firebaseio.com`;
    } else {
      databaseURL = (await this.projectManager.getConfig()).databaseURL;
    }

    return `${databaseURL}/${path}.json`;
  }
}

export interface ShallowObject {
  [k: string]: true;
}

export type DatabaseShallowValue =
  | ShallowObject
  | string
  | boolean
  | number
  | null;

export interface DatabaseInstance {
  instance: string;
  projectNumber: string;
  type: 'DEFAULT_REALTIME_DATABASE' | 'USER_REALTIME_DATABASE';
}

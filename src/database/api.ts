import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';
import { AccountInfo, RequestOptions } from '../accounts/AccountManager';
import { API } from '../api';

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

  private request(
    method: string,
    url: string,
    options: RequestOptions = {}
  ): Promise<request.FullResponse> {
    return this.projectManager.accountManager.request(method, url, options);
  }

  async listDatabases(): Promise<DatabaseInstance[]> {
    const url = [
      API.mobilesdk.origin,
      API.mobilesdk.version,
      'projects',
      this.project.projectNumber,
      'databases'
    ].join('/');
    const response = await this.request('GET', url);
    return response.body.instance || [];
  }

  async getShallow(
    path: string,
    instance?: string
  ): Promise<DatabaseShallowValue> {
    try {
      const response = await this.request(
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
    return this.request('PUT', await this.getURLForPath(path, instance), {
      body: value
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

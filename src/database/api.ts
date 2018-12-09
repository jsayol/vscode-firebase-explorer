import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

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

  async getShallow(path: string): Promise<DatabaseShallowValue> {
    try {
      const token = await this.projectManager.getAccessToken();
      const reqOptions: request.OptionsWithUrl = {
        method: 'GET',
        url: await this.getURLForPath(path),
        json: true,
        qs: { shallow: true, access_token: token }
      };
      return request(reqOptions);
    } catch (err) {
      // TODO: handle error
      console.log('getShallow', { err });
      return null;
    }
  }

  async setValue(path: string, value: any): Promise<request.FullResponse> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'PUT',
      url: await this.getURLForPath(path),
      json: true,
      qs: { access_token: token },
      body: value,
      resolveWithFullResponse: true
    };
    return request(reqOptions);
  }

  remove(path: string): Promise<request.FullResponse> {
    return this.setValue(path, null);
  }

  private async getURLForPath(path: string): Promise<string> {
    const { databaseURL } = await this.projectManager.getConfig();
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

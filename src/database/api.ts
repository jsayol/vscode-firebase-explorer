import * as request from 'request-promise-native';
import { contains } from '../utils';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';

const instances: { [k: string]: DatabaseAPI } = {};

export class DatabaseAPI {
  static for(account: AccountInfo, project: FirebaseProject): DatabaseAPI {
    const id = account.user.email + '--' + project.id;
    if (!contains(instances, id)) {
      instances[id] = new DatabaseAPI(account, project);
    }
    return instances[id];
  }

  projectId: string;
  projectManager: ProjectManager;

  private constructor(account: AccountInfo, project: FirebaseProject) {
    this.projectId = project.id;
    this.projectManager = ProjectManager.for(account, project);
  }

  async getShallow(path: string): Promise<DatabaseShallowValue> {
    const { access_token } = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'GET',
      url: await this.getURLForPath(path),
      json: true,
      qs: { shallow: true, access_token }
    };
    return request(reqOptions);
  }

  async setValue(path: string, value: any): Promise<request.FullResponse> {
    const { access_token } = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'PUT',
      url: await this.getURLForPath(path),
      json: true,
      qs: { access_token },
      body: value,
      resolveWithFullResponse: true
    };
    return request(reqOptions);
  }

  remove(path: string): Promise<request.FullResponse> {
    return this.setValue(path, null);
    // const { access_token } = await this.projectManager.getAccessToken();
    // const reqOptions: request.OptionsWithUrl = {
    //   method: 'DELETE',
    //   url: await this.getURLForPath(path),
    //   json: true,
    //   qs: { access_token },
    //   resolveWithFullResponse: true
    // };
    // return request(reqOptions);
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

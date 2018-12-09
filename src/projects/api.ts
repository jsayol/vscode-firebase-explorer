import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { FirebaseProject, ProjectConfig } from './ProjectManager';
import { AccountManager, AccountInfo } from '../accounts/AccountManager';
import { contains } from '../utils';

const API = {
  origin: 'https://firebase.googleapis.com',
  endpointPrefix: '/v1beta1/projects'
};

const instances: { [k: string]: ProjectsAPI } = {};

export class ProjectsAPI {
  static for(account: AccountInfo): ProjectsAPI {
    const id = account.user.email;
    if (!contains(instances, id)) {
      instances[id] = new ProjectsAPI(account);
    }
    return instances[id];
  }

  accountManager: AccountManager;

  private constructor(account: AccountInfo) {
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

  async listProjects(): Promise<FirebaseProject[]> {
    try {
      const response = await this.authedRequest('GET', '');

      if (response.body && response.body.results) {
        const projects: FirebaseProject[] = response.body.results;
        return projects;
      }
    } catch (err) {
      console.log('listProjects', { err });
      // Failed to retrieve the projects
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve the projects for ${this.accountManager.getEmail()}`
    );

    return [];
  }

  async getProjectConfig(project: FirebaseProject): Promise<ProjectConfig> {
    // FIXME: this should get the config from the REST API, but there seems to be a bug
    return {
      projectId: project.projectId,
      databaseURL: `https://${project.projectId}.firebaseio.com`,
      storageBucket: project.resources.storageBucket,
      locationId: project.resources.locationId
    };
  }
}

// export async function getProjectConfig_old(
//   accountManager: AccountManager,
//   project: FirebaseProject
// ): Promise<ProjectConfig> {
//   console.log(project);
//   try {
//     const response = await apiRequest(
//       'GET',
//       `/${project.projectId}/adminSdkConfig`,
//       {
//         accountManager
//       }
//     );
//     if (response.body) {
//       return response.body;
//     }
//   } catch (err) {
//     console.log('ERR getProjectConfig ' + project.projectId, { err });
//   }

//   throw new Error(
//     `Failed to retrieve the config for project ${project.projectId}`
//   );
// }

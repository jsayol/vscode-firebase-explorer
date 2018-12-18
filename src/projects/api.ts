import * as request from 'request-promise-native';
import { FirebaseProject, ProjectConfig, ProjectInfo } from './ProjectManager';
import { AccountManager, AccountInfo } from '../accounts/AccountManager';
import { contains } from '../utils';

// https://mobilesdk-pa.googleapis.com/v1/projects
// https://mobilesdk-pa.googleapis.com/v1/projects/[projectNumber]

const CONFIG = {
  origin: 'https://firebase.googleapis.com',
  version: 'v1beta1',
  mobilesdk: {
    origin: 'https://mobilesdk-pa.googleapis.com',
    version: 'v1'
  }
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

  /**
   * Several projects seem to be missing for some users when listing them
   * using the Project Management API.
   * We switched to using the private "mobilesdk-pa" API for now.
   */
  async listProjects(): Promise<FirebaseProject[]> {
    try {
      const response = await this.authedRequest('GET', '', {
        url: `${CONFIG.mobilesdk.origin}/${CONFIG.mobilesdk.version}/projects`
      });
      if (response.body && response.body.project) {
        return response.body.project;
      } else {
        return [];
      }
    } catch (err) {
      throw new Error(
        `Failed to retrieve the projects for ${this.accountManager.getEmail()}: ${err}`
      );
    }
  }

  // async listProjects_missing(): Promise<FirebaseProject[]> {
  //   try {
  //     const response = await this.authedRequest('GET', 'projects');
  //     if (response.body && response.body.results) {
  //       return response.body.results;
  //     } else {
  //       return [];
  //     }
  //   } catch (err) {
  //     throw new Error(
  //       `Failed to retrieve the projects for ${this.accountManager.getEmail()}: ${err}`
  //     );
  //   }
  // }

  async listAvailableProjects(): Promise<ProjectInfo[]> {
    try {
      const response = await this.authedRequest('GET', 'availableProjects');
      if (response.body && response.body.projectInfo) {
        return response.body.projectInfo;
      } else {
        return [];
      }
    } catch (err) {
      throw new Error(
        `Failed to retrieve the available projects for ${this.accountManager.getEmail()}: ${err}`
      );
    }
  }

  async getProjectConfig(project: FirebaseProject): Promise<ProjectConfig> {
    try {
      const response = await this.authedRequest('GET', '', {
        url: `${CONFIG.mobilesdk.origin}/${CONFIG.mobilesdk.version}/projects/${
          project.projectNumber
        }:getServerAppConfig`
      });

      if (!response.body) {
        throw new Error(response);
      }

      return response.body;
    } catch (err) {
      throw new Error(
        `Failed to retrieve the config for project ${project.projectId}: ${err}`
      );
    }
  }

  async getDebugData() {
    const projectsUrl = `${CONFIG.mobilesdk.origin}/${
      CONFIG.mobilesdk.version
    }/projects`;

    const [firebase, mobilesdk] = await Promise.all([
      this.authedRequest('GET', 'projects')
        .then(resp => resp.body.results)
        .catch(err => err),
      this.authedRequest('GET', '', { url: projectsUrl })
        .then(resp => resp.body.project)
        .catch(err => err)
    ]);

    return { firebase, mobilesdk };
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

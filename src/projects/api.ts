import * as request from 'request-promise-native';
import { AccountInfo, AccountManager } from '../accounts/AccountManager';
import { contains, caseInsensitiveCompare } from '../utils';
import { FirebaseProject, ProjectConfig, ProjectInfo } from './ProjectManager';

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
      if (response.body && Array.isArray(response.body.project)) {
        return (response.body.project as FirebaseProject[]).sort(
          (projA, projB) => {
            const nameA = projA.displayName || projA.projectId;
            const nameB = projB.displayName || projB.projectId;
            return caseInsensitiveCompare(nameA, nameB);
          }
        );
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
      const response = await this.authedRequest(
        'GET',
        `projects/${project.projectId}/adminSdkConfig`
      );

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
}

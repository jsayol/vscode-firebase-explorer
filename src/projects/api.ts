import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { FirebaseProject, ProjectConfig } from './ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import { EXTENSION_VERSION } from '../utils';
import { AndroidAppProps, IosAppProps } from '../apps/apps';

const API = {
  origin: 'https://firebase.googleapis.com',
  endpointPrefix: '/v1beta1/projects'
};

function validateAppType(type: string): void | never {
  if (['ios', 'android'].indexOf(type) === -1) {
    throw new Error('Unsupported app type');
  }
}

interface RequestOptions extends Partial<request.OptionsWithUrl> {
  accountManager?: AccountManager;
}

async function apiRequest(
  method: string,
  resource: string,
  options: RequestOptions
): Promise<request.FullResponse> {
  let { accountManager, ...partialReqOptions } = options;

  const reqOptions: request.OptionsWithUrl = {
    method,
    url: API.origin + API.endpointPrefix + resource,
    resolveWithFullResponse: true,
    json: true,
    ...partialReqOptions
  };

  if (accountManager) {
    const token = await accountManager.getAccessToken();

    reqOptions.headers = {
      Authorization: `Bearer ${token.access_token}`,
      'User-Agent': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      'X-Client-Version': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      ...reqOptions.headers
    };
  }

  return request(reqOptions);
}

export async function listProjects(
  accountManager: AccountManager
): Promise<FirebaseProject[]> {
  try {
    const response = await apiRequest('GET', '', {
      accountManager
    });
    if (response.body && response.body.results) {
      const projects: FirebaseProject[] = response.body.results;
      return projects;
    }
  } catch (err) {
    console.log('listProjects', { err });
    // Failed to retrieve the projects
  }

  vscode.window.showErrorMessage(
    `Failed to retrieve the projects for ${accountManager.getEmail()}`
  );

  return [];
}

export function listIosApps(
  accountManager: AccountManager,
  projectId: string
): Promise<IosAppProps[]> {
  return listAppsForType('ios', accountManager, projectId);
}

export function listAndroidApps(
  accountManager: AccountManager,
  projectId: string
): Promise<AndroidAppProps[]> {
  return listAppsForType('android', accountManager, projectId);
}

async function listAppsForType(
  type: 'ios',
  accountManager: AccountManager,
  projectId: string
): Promise<IosAppProps[]>;
async function listAppsForType(
  type: 'android',
  accountManager: AccountManager,
  projectId: string
): Promise<AndroidAppProps[]>;
async function listAppsForType(
  type: 'ios' | 'android',
  accountManager: AccountManager,
  projectId: string
): Promise<IosAppProps[] | AndroidAppProps[]> {
  validateAppType(type);
  try {
    const response = await apiRequest('GET', `/${projectId}/${type}Apps`, {
      accountManager,
      qs: {
        pageSize: 100
      }
    });
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
    // Failed to retrieve the apps
  }

  vscode.window.showErrorMessage(
    `Failed to retrieve the ${type} apps for ${projectId}`
  );

  return [];
}

export async function getAppConfig(
  type: string,
  accountManager: AccountManager,
  projectId: string,
  appId: string
): Promise<string | undefined> {
  validateAppType(type);

  try {
    const response = await apiRequest(
      'GET',
      `/${projectId}/${type}Apps/${appId}/config`,
      { accountManager }
    );
    if (response.body && response.body.configFileContents) {
      // There's also body.configFilename
      return response.body.configFileContents;
    }
  } catch (err) {
    console.log('getAppConfig ' + type, { err });
    // Failed to retrieve the config
  }

  vscode.window.showErrorMessage(
    `Failed to retrieve the config for app ${appId}`
  );

  return;
}

export async function getProjectConfig(
  accountManager: AccountManager,
  project: FirebaseProject
): Promise<ProjectConfig> {
  // FIXME: this should get the config from the REST API, but there seems to be a bug
  return {
    projectId: project.projectId,
    databaseURL: `https://${project.projectId}.firebaseio.com`,
    storageBucket: project.resources.storageBucket,
    locationId: project.resources.locationId
  };
}

export async function getProjectConfig_old(
  accountManager: AccountManager,
  project: FirebaseProject
): Promise<ProjectConfig> {
  console.log(project);
  try {
    const response = await apiRequest(
      'GET',
      `/${project.projectId}/adminSdkConfig`,
      {
        accountManager
      }
    );
    if (response.body) {
      return response.body;
    }
  } catch (err) {
    // console.log('ERR getProjectConfig ' + projectId, { err });
    // Failed to retrieve the config
  }

  // vscode.window.showErrorMessage(
  //   `Failed to retrieve the config for project ${projectId}`
  // );
  throw new Error(
    `Failed to retrieve the config for project ${project.projectId}`
  );
}

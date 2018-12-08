import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { FirebaseProject, ProjectConfig } from './ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import { EXTENSION_VERSION } from '../utils';
import { AndroidAppProps, IosAppProps, ShaCertificate } from '../apps/apps';

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
  }

  vscode.window.showErrorMessage(
    `Failed to retrieve the ${type} apps for ${projectId}`
  );

  return [];
}

export async function getAppConfig(
  type: string,
  accountManager: AccountManager,
  appId: string
): Promise<string | undefined> {
  validateAppType(type);

  try {
    const response = await apiRequest('GET', `/-/${type}Apps/${appId}/config`, {
      accountManager
    });

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

export async function getShaCertificates(
  accountManager: AccountManager,
  appId: string
): Promise<ShaCertificate[]> {
  try {
    const response = await apiRequest('GET', `/-/androidApps/${appId}/sha`, {
      accountManager
    });

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

export async function addShaCertificate(
  accountManager: AccountManager,
  appId: string,
  cert: ShaCertificate
): Promise<void> {
  try {
    const response = await apiRequest('POST', `/-/androidApps/${appId}/sha`, {
      accountManager,
      body: cert
    });

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

export async function deleteShaCertificate(
  accountManager: AccountManager,
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
    const response = await apiRequest('DELETE', resource, {
      accountManager
    });

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

export async function setDisplayName(
  type: string,
  accountManager: AccountManager,
  appId: string,
  newDisplayName: string
): Promise<IosAppProps | AndroidAppProps | undefined> {
  validateAppType(type);

  try {
    const response = await apiRequest('PATCH', `/-/${type}Apps/${appId}`, {
      accountManager,
      qs: {
        updateMask: 'display_name'
      },
      body: {
        displayName: newDisplayName
      }
    });

    if (response.statusCode === 200) {
      return response.body;
    }
  } catch (err) {
    console.log('getAppConfig ' + type, { err });
  }

  vscode.window.showErrorMessage(
    `Failed to retrieve the config for app ${appId}`
  );

  return;
}

export async function getProjectConfig(
  // accountManager: AccountManager,
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

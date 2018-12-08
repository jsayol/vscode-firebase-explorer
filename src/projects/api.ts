import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject } from './ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import { EXTENSION_VERSION } from '../utils';

const API = {
  adminOrigin: 'https://firebase.googleapis.com'
};

async function apiRequest(
  method: string,
  resource: string,
  options: { [k: string]: any },
  account?: AccountInfo
): Promise<request.FullResponse> {
  const reqOptions: request.OptionsWithUrl = {
    ...options,
    method,
    url: API.adminOrigin + resource,
    resolveWithFullResponse: true,
    json: true
  };

  if (account) {
    const accountManager = AccountManager.for(account);
    const token = await accountManager.getAccessToken();

    reqOptions.headers = {
      ...reqOptions.headers,
      Authorization: `Bearer ${token.access_token}`,
      'User-Agent': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      'X-Client-Version': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION
    };
  }

  return request(reqOptions);
}

export async function listProjects(
  account: AccountInfo
): Promise<FirebaseProject[]> {
  try {
    const response = await apiRequest('GET', '/v1beta1/projects', {}, account);
    if (response.body && response.body.results) {
      const projects: FirebaseProject[] = response.body.results;
      return projects;
    }
  } catch (err) {
    console.log({ err });
    // Failed to retrieve the projects
  }

  vscode.window.showErrorMessage(
    'Failed to retrieve the projects for ' + account.user.email
  );

  return [];
}

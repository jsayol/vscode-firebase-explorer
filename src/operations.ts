// import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { AccountManager } from './accounts/manager';

const EXPONENTIAL_BACKOFF_WAIT = 500; // initial wait until retry, in ms
const EXPONENTIAL_BACKOFF_FACTOR = 2;
const EXPONENTIAL_BACKOFF_MAX = 5000; // maximum wait until next retry, in ms

const API = {
  origin: 'https://firebase.googleapis.com',
  endpointPrefix: '/v1/'
};

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
      Authorization: `Bearer ${token}`,
      'User-Agent': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      'X-Client-Version': 'VSCodeFirebaseExtension/' + EXTENSION_VERSION,
      ...reqOptions.headers
    };
  }

  return request(reqOptions);
}

export interface Operation {
  name: string;
  metadata: {
    '@type': string;
    [k: string]: string;
  };
  done: boolean;

  // A result will only have one of "error" or "response"
  error?: OperationResultError;
  response?: OperationResultResponse;
}

export interface OperationResultError {
  code: number;
  message: string;
  details: [
    {
      '@type': string;
      [k: string]: string;
    }
  ];
}

export interface OperationResultResponse {
  '@type': string;
  [k: string]: string;
}

export async function waitUntilDone(
  opName: string,
  accountManager: AccountManager,
  backoffWait = EXPONENTIAL_BACKOFF_WAIT
): Promise<Operation> {
  const operation = await getOperation(opName, accountManager);

  if (operation.done) {
    return operation;
  } else {
    return new Promise<Operation>((resolve, reject) => {
      setTimeout(() => {
        const nextWait = Math.min(
          backoffWait * EXPONENTIAL_BACKOFF_FACTOR,
          EXPONENTIAL_BACKOFF_MAX
        );
        try {
          resolve(waitUntilDone(opName, accountManager, nextWait));
        } catch (err) {
          reject(err);
        }
        resolve();
      }, backoffWait);
    });
  }
}

async function getOperation(
  opName: string,
  accountManager: AccountManager
): Promise<Operation> {
  const response = await apiRequest('GET', opName, { accountManager });

  if (response.statusCode !== 200) {
    throw new Error('Failed retrieving operation');
  }

  return response.body;
}

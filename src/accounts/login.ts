import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as request from 'request-promise-native';
import * as jwt from 'jsonwebtoken';
import * as portfinder from 'portfinder';
import { parse as parseUrl } from 'url';
import * as vscode from 'vscode';
import { contains } from '../utils';
import { AccountInfo, AccountTokens, AccountUser } from './AccountManager';

const readFile = util.promisify(fs.readFile);

export const API = {
  clientId:
    '877476249439-8vpbm9f7r5mvqge6ctu056prbb0did6a.apps.googleusercontent.com',
  clientSecret: 'TseOCjZ0MXoReF0EL65W-1WG',
  authOrigin: 'https://accounts.google.com',
  refreshTokenHost: 'www.googleapis.com',
  refreshTokenPath: '/oauth2/v4/token'
};

const SCOPES = [
  // OPENID
  'openid',

  // EMAIL
  'email',

  // CLOUD_PROJECTS_READONLY
  'https://www.googleapis.com/auth/cloudplatformprojects.readonly',

  // FIREBASE_PLATFORM
  'https://www.googleapis.com/auth/firebase',

  // CLOUD_PLATFORM
  'https://www.googleapis.com/auth/cloud-platform'
];

const NONCE = Math.round(Math.random() * (2 << 29) + 1).toString();

let lastAccessToken: AccountTokens | null = null;

export async function login(): Promise<AccountInfo> {
  const port = await portfinder.getPortPromise({ port: 9005 });

  return new Promise<AccountInfo>((resolve, reject) => {
    const callbackUrl = 'http://localhost:' + port;
    const authUrl = getLoginUrl(callbackUrl);

    const server = http.createServer(async (req, res) => {
      const { query } = parseUrl(req.url!, true);
      let failure = false;

      if (query.state === NONCE && typeof query.code === 'string') {
        try {
          const tokens = await getTokensFromAuthCode(query.code, callbackUrl);
          await respondWithFile(
            req,
            res,
            200,
            '../ui/login/success.html'
          );
          server.close();
          resolve({
            user: jwt.decode(tokens.id_token) as AccountUser,
            tokens,
            origin: 'login'
          });
        } catch (err) {
          console.error(err);
          failure = true;
        }
      } else {
        console.error('Something wrong with query', query);
        failure = true;
      }

      if (failure) {
        await respondWithFile(
          req,
          res,
          400,
          '../ui/login/failure.html'
        );
        reject();
      }
    });

    server.listen(port, async () => {
      vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(authUrl));
    });

    server.on('error', err => {
      console.error('Server error', err);
      // _loginWithoutLocalhost().then(resolve, reject);
    });
  });
}

function getLoginParams(callbackUrl: string): StringObject {
  return {
    client_id: API.clientId,
    scope: SCOPES.join(' '),
    response_type: 'code',
    state: NONCE,
    redirect_uri: callbackUrl
  };
}

function getLoginUrl(callbackUrl: string): string {
  const loginParams = getLoginParams(callbackUrl);

  let loginQueryParams: string[] = [];
  for (const key of Object.keys(loginParams)) {
    loginQueryParams.push(key + '=' + encodeURIComponent(loginParams[key]));
  }

  return API.authOrigin + '/o/oauth2/auth?' + loginQueryParams.join('&');
}

async function getTokensFromAuthCode(
  code: string,
  callbackUrl: string
): Promise<AccountTokens> {
  const reqOptions: request.OptionsWithUrl = {
    method: 'POST',
    url: API.authOrigin + '/o/oauth2/token',
    json: true,
    form: {
      code: code,
      client_id: API.clientId,
      client_secret: API.clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code'
    }
  };

  try {
    const response = await doRequest(reqOptions);

    if (
      !contains(response, 'body') ||
      (!contains(response.body, 'access_token') &&
        !contains(response.body, 'refresh_token'))
    ) {
      console.log('Token Fetch Error:', response.statusCode, response.body);
      throw new Error('Invalid credential');
    }
    lastAccessToken = Object.assign(
      {
        expires_at: Date.now() + response.body.expires_in * 1000
      },
      response.body
    );
    return lastAccessToken!;
  } catch (err) {
    console.log('Token Fetch Error:', err);
    throw new Error('Invalid credential');
  }
}

async function doRequest(
  options: request.OptionsWithUrl
): Promise<request.FullResponse> {
  const response: request.FullResponse = await request({
    ...options,
    resolveWithFullResponse: true
  });

  if (response.statusCode >= 400) {
    throw response;
  }

  return response;
}

async function respondWithFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  filename: string
): Promise<void> {
  const response = await readFile(path.join(__dirname, filename));
  res.writeHead(statusCode, {
    'Content-Length': response.length,
    'Content-Type': 'text/html'
  });
  res.end(response);
  req.socket.destroy();
}

type StringObject = { [k: string]: string };

import * as http from 'http';
import * as path from 'path';
import * as request from 'request-promise-native';
import * as jwt from 'jsonwebtoken';
import * as portfinder from 'portfinder';
import { parse as parseUrl } from 'url';
import * as vscode from 'vscode';
import { contains, readFile } from '../utils';
import { AccountInfo, AccountTokens, AccountUser } from './AccountManager';
import { API_CONFIG } from './api';

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

const servers: { [k: string]: http.Server } = {};

export async function initiateLogin(nonce: string): Promise<AccountInfo> {
  const port = await portfinder.getPortPromise({ port: 9005 });

  return new Promise<AccountInfo>((resolve, reject) => {
    const callbackUrl = 'http://localhost:' + port;

    servers[nonce] = http.createServer(async (req, res) => {
      const { query } = parseUrl(req.url!, true);
      let failure = false;

      if (query.state === nonce && typeof query.code === 'string') {
        try {
          const tokens = await getTokensFromAuthCode(query.code, callbackUrl);
          await respondWithFile(req, res, 200, '../ui/login/success.html');
          endLogin(nonce);
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
        await respondWithFile(req, res, 400, '../ui/login/failure.html');
        reject();
      }

      delete servers[nonce];
    });

    servers[nonce].listen(port, () => {
      const loginParams: { [k: string]: string } = {
        client_id: API_CONFIG.clientId,
        scope: SCOPES.join(' '),
        response_type: 'code',
        state: nonce,
        redirect_uri: callbackUrl
      };

      let loginQueryParams: string[] = [];
      for (const [key, param] of Object.entries(loginParams)) {
        loginQueryParams.push(key + '=' + encodeURIComponent(param));
      }

      const loginUrl =
        API_CONFIG.authOrigin + '/o/oauth2/auth?' + loginQueryParams.join('&');
      vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(loginUrl));
    });

    servers[nonce].on('error', err => {
      console.error('Server error', err);
    });
  });
}

export function endLogin(nonce: string) {
  if (servers[nonce]) {
    servers[nonce].close();
    delete servers[nonce];
  }
}

async function getTokensFromAuthCode(
  code: string,
  callbackUrl: string
): Promise<AccountTokens> {
  const reqOptions: request.OptionsWithUrl = {
    method: 'POST',
    url: API_CONFIG.authOrigin + '/o/oauth2/token',
    resolveWithFullResponse: true,
    json: true,
    form: {
      code: code,
      client_id: API_CONFIG.clientId,
      client_secret: API_CONFIG.clientSecret,
      redirect_uri: callbackUrl,
      grant_type: 'authorization_code'
    }
  };

  try {
    const response: request.FullResponse = await request(reqOptions);

    if (response.statusCode >= 400) {
      throw response;
    }

    if (
      !contains(response, 'body') ||
      (!contains(response.body, 'access_token') &&
        !contains(response.body, 'refresh_token'))
    ) {
      console.log('Token Fetch Error:', response.statusCode, response.body);
      throw new Error('Invalid credential');
    }

    const tokens: AccountTokens = response.body;
    tokens.expires_at = Date.now() + 1000 * tokens.expires_in;
    return response.body;
  } catch (err) {
    console.log('Token Fetch Error:', err);
    throw new Error('Invalid credential');
  }
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

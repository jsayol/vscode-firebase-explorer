import * as vscode from 'vscode';
import * as linkify from 'linkify-urls';
import { postToPanel, readFile, getFilePath, ansiToHTML } from '../utils';
import { WebSocketServer } from './server';
import { startEmulators, stopEmulators } from './utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

let context: vscode.ExtensionContext;
let dashboardPanel: vscode.WebviewPanel | undefined;
let isDashboardReady = false;
let server: WebSocketServer | undefined;
let unsubStdout: (() => void) | undefined;
let unsubStderr: (() => void) | undefined;
let unsubClose: (() => void) | undefined;

export function registerEmulatorsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.emulators.openDashboard',
      openDashboard
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.emulators.stopServer',
      stopServer
    )
  );
}

async function openDashboard(): Promise<void> {
  try {
    if (dashboardPanel) {
      if (isDashboardReady) {
        // setImmediate(() => {
        //   postToPanel(dashboardPanel, {
        //     command: 'focus'
        //   });
        // });
      }
      dashboardPanel.reveal();
    } else {
      dashboardPanel = vscode.window.createWebviewPanel(
        'emulators.dashboard',
        'Emulators',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      dashboardPanel.webview.html = await readFile(
        getFilePath('ui', 'emulators', 'dashboard.html'),
        'utf8'
      );

      dashboardPanel.webview.onDidReceiveMessage(async (data: any) => {
        switch (data.command) {
          case 'ready':
            isDashboardReady = true;
            postToPanel(dashboardPanel!, {
              command: 'initialize'
              // TODO: projects, accounts, etc
            });
            break;
          case 'start':
            console.group('start', server);
            if (server) {
              unsubStdout = server.on('stdout', ({ data }) => {
                postToPanel(dashboardPanel!, {
                  command: 'stdout',
                  message: linkify(ansiToHTML(data))
                });
              });

              unsubStderr = server.on('stderr', ({ data }) => {
                postToPanel(dashboardPanel!, {
                  command: 'stderr',
                  message: linkify(ansiToHTML(data))
                });
              });

              unsubClose = server.on('close', () => {
                postToPanel(dashboardPanel!, {
                  command: 'server-closed'
                });
              });

              // TODO:
              // const { project, account, emulators } = data as {
              //   project: FirebaseProject;
              //   account: AccountInfo;
              //   emulators: 'all' | string[];
              // };
              const account = context.globalState.get<AccountInfo>(
                'selectedAccount'
              );
              const project = context.globalState.get<FirebaseProject>(
                'selectedProject'
              );
              const emulators = ['functions'];
              await startEmulators(server, project, account, emulators);
            }
            break;
          case 'stop':
            if (server) {
              unsubStdout!();
              unsubStderr!();
              unsubClose!();
              unsubStdout = undefined;
              unsubStderr = undefined;
              unsubClose = undefined;
              await stopEmulators(server);
            }
            break;
        }
      });

      // panel.onDidChangeViewState(
      //   _event => {
      //     const panel = _event.webviewPanel;
      //   },
      //   null,
      //   context.subscriptions
      // );

      dashboardPanel.onDidDispose(
        () => {
          dashboardPanel = undefined;
          isDashboardReady = false;
        },
        null,
        context.subscriptions
      );

      if (!server) {
        server = new WebSocketServer();
      }
    }
  } catch (err) {
    console.log(err);
  }
}

async function stopServer(): Promise<void> {
  if (server) {
    await server.stop();
    server = undefined;
  }
}

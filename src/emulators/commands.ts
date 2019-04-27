import * as vscode from 'vscode';
import * as linkify from 'linkify-urls';
import {
  postToPanel,
  readFile,
  getFilePath,
  ansiToHTML,
  replaceResources
} from '../utils';
import { WebSocketServer } from './server';
import { startEmulators, stopEmulators, listAllProjects } from './utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

const processes = require('listening-processes');

let context: vscode.ExtensionContext;
let dashboardPanel: vscode.WebviewPanel | undefined;
let isDashboardReady = false;
let server: WebSocketServer | undefined;
let unsubStdout: (() => void) | undefined;
let unsubStderr: (() => void) | undefined;
let unsubLog: (() => void) | undefined;
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
        setImmediate(() => {
          postToPanel(dashboardPanel!, {
            command: 'focus'
          });
        });
      }
      dashboardPanel.reveal();
    } else {
      dashboardPanel = vscode.window.createWebviewPanel(
        'emulators.dashboard',
        'Firebase Emulators',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          enableFindWidget: true,
          retainContextWhenHidden: true
        }
      );

      dashboardPanel.iconPath = vscode.Uri.file(
        getFilePath('assets/firebase-color-small.svg')
      );

      let content = await readFile(
        getFilePath('ui', 'emulators', 'dashboard.html'),
        'utf8'
      );
      dashboardPanel.webview.html = replaceResources(content);

      dashboardPanel.webview.onDidReceiveMessage(async (data: any) => {
        switch (data.command) {
          case 'ready':
            const folders = (vscode.workspace.workspaceFolders || []).map(
              folder => ({ name: folder.name, path: folder.uri.fsPath })
            );
            const selectedAccount = context.globalState.get<AccountInfo>(
              'selectedAccount'
            );
            const selectedProject = context.globalState.get<FirebaseProject>(
              'selectedProject'
            );
            isDashboardReady = true;
            postToPanel(dashboardPanel!, {
              command: 'initialize',
              folders,
              accountsWithProjects: await listAllProjects(),
              selectedAccountEmail:
                selectedAccount && selectedAccount.user.email,
              selectedProjectId: selectedProject && selectedProject.projectId
            });
            break;
          case 'start':
            if (server) {
              unsubStdout = server.on('stdout', ({ data }) => {
                if (dashboardPanel) {
                  postToPanel(dashboardPanel, {
                    command: 'stdout',
                    message: linkify(ansiToHTML(data))
                  });
                }
              });

              unsubStderr = server.on('stderr', ({ data }) => {
                if (dashboardPanel) {
                  postToPanel(dashboardPanel, {
                    command: 'stderr',
                    message: linkify(ansiToHTML(data))
                  });
                }
              });

              unsubLog = server.on('log', logEntry => {
                if (dashboardPanel) {
                  postToPanel(dashboardPanel, {
                    command: 'log',
                    message: logEntry
                  });
                }
              });

              unsubClose = server.on('close', () => {
                // if (dashboardPanel) {
                //   postToPanel(dashboardPanel, { command: 'server-closed' });
                // }
                serverCleanup();
              });

              const { path, email, projectId, emulators } = data as {
                path: string;
                email: string;
                projectId: string;
                emulators: 'all' | string[];
              };

              // This promise resolves when the child process exits
              await startEmulators(server, path, email, projectId, emulators);
              // The CLI has exited
              if (dashboardPanel) {
                postToPanel(dashboardPanel, { command: 'server-closed' });
                serverCleanup();
              }
            }
            break;
          case 'stop':
            if (server) {
              await stopEmulators(server);
            }
            break;
          case 'who-has-port':
            // TODO: check if this works on windows & mac
            const portToFind = Number(data.port);
            const procs = processes();
            for (const [, value] of Object.entries(procs)) {
              const proc = (value as any[]).find(
                proc => Number(proc.port) === portToFind
              );
              if (proc) {
                postToPanel(dashboardPanel!, {
                  ...data,
                  command: 'who-has-port-response',
                  processInfo: proc
                });
                break; // for-loop
              }
            }
            break;
          case 'kill-process':
            // TODO: processes.kill() sends a SIGKILL, which is quite brute force.
            // Maybe find a way to send a SIGINT first? If the process is still
            // running after a certain timeout has passsed, then try with SIGKILL.
            const { success } = processes.kill(data.pid);
            postToPanel(dashboardPanel!, {
              command: 'kill-process-result',
              pid: data.pid,
              success: (success as number[]).includes(data.pid)
            });
            break;
        }
      });

      dashboardPanel.onDidDispose(
        async () => {
          dashboardPanel = undefined;
          isDashboardReady = false;
          if (server) {
            serverCleanup();
            await stopEmulators(server);
          }
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

function serverCleanup() {
  if (unsubStdout) {
    unsubStdout();
  }
  if (unsubStderr) {
    unsubStderr();
  }
  if (unsubLog) {
    unsubLog();
  }
  if (unsubClose) {
    unsubClose();
  }
  unsubStdout = undefined;
  unsubStderr = undefined;
  unsubLog = undefined;
  unsubClose = undefined;
}

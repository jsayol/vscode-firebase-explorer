import * as vscode from 'vscode';
import {
  readFile,
  getFilePath,
  replaceResources,
  postToPanel,
  webviewPanels
} from '../utils';
import { WebSocketServer } from './server';
import {
  stopEmulators,
  listAllProjects,
  killProcess,
  prepareServerStart,
  getProjectForFolder
} from './utils';

let context: vscode.ExtensionContext;
let isDashboardReady = false;
let server: WebSocketServer | undefined;

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
  // TODO: refuse to open if there are no workspace folders.

  // TODO: refuse to open if there are no accounts logged in.

  // TODO: refuse to open if the logged in accounts have no projects.

  try {
    if (webviewPanels.emulators) {
      if (isDashboardReady) {
        setImmediate(() => {
          postToPanel(webviewPanels.emulators!, {
            command: 'focus'
          });
        });
      }
      webviewPanels.emulators.reveal();
    } else {
      webviewPanels.emulators = vscode.window.createWebviewPanel(
        'emulators.dashboard',
        'Firebase Emulators',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          enableFindWidget: true,
          retainContextWhenHidden: true
        }
      );

      webviewPanels.emulators.iconPath = vscode.Uri.file(
        getFilePath('assets/firebase-color-small.svg')
      );

      let content = await readFile(
        getFilePath('ui', 'emulators', 'dashboard.html'),
        'utf8'
      );
      webviewPanels.emulators.webview.html = replaceResources(content);

      webviewPanels.emulators.webview.onDidReceiveMessage(async (data: any) => {
        switch (data.command) {
          case 'ready':
            const folders = (vscode.workspace.workspaceFolders || []).map(
              folder => ({ name: folder.name, path: folder.uri.fsPath })
            );
            isDashboardReady = true;
            postToPanel(webviewPanels.emulators!, {
              command: 'initialize',
              folders,
              accountsWithProjects: await listAllProjects()
            });
            break;
          case 'start':
            await prepareServerStart(server!, data.options);
            break;
          case 'stop':
            await stopEmulators();
            break;
          case 'kill-process':
            const success = await killProcess(data.pid);
            postToPanel(webviewPanels.emulators!, {
              command: 'kill-process-result',
              success
            });
            break;
          case 'folder-selected':
            const foundProject = await getProjectForFolder(data.path);
            postToPanel(webviewPanels.emulators!, {
              command: 'select-project',
              email: foundProject && foundProject.account.user.email,
              projectId: foundProject && foundProject.project.projectId
            });
            break;
          case 'set-debugging-state':
            if (server) {
              await server.setDebuggingState(data.enabled);
            }
            break;
        }
      });

      // TODO: detect when a workspace folder is added or removed and
      // pass that information to the webview.

      webviewPanels.emulators.onDidDispose(
        async () => {
          webviewPanels.emulators = undefined;
          isDashboardReady = false;
          if (server) {
            server.removeAllListeners();
            await stopEmulators();
          }
        },
        null,
        context.subscriptions
      );

      if (!server) {
        server = new WebSocketServer();
      }

      server.removeAllListeners();
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

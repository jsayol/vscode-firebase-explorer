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
  prepareServerStart
} from './utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

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
            const selectedAccount = context.globalState.get<AccountInfo>(
              'selectedAccount'
            );
            const selectedProject = context.globalState.get<FirebaseProject>(
              'selectedProject'
            );
            isDashboardReady = true;
            postToPanel(webviewPanels.emulators!, {
              command: 'initialize',
              folders,
              accountsWithProjects: await listAllProjects(),
              selectedAccountEmail:
                selectedAccount && selectedAccount.user.email,
              selectedProjectId: selectedProject && selectedProject.projectId
            });
            break;
          case 'start':
            await prepareServerStart(server!, data);
            break;
          case 'stop':
            await stopEmulators();
            break;
          case 'kill-process':
            const success = killProcess(data.pid);
            postToPanel(webviewPanels.emulators!, {
              command: 'kill-process-result',
              pid: data.pid,
              success
            });
            break;
        }
      });

      webviewPanels.emulators.onDidDispose(
        async () => {
          webviewPanels.emulators = undefined;
          isDashboardReady = false;
          if (server) {
            server.clearListeners();
            await stopEmulators();
          }
        },
        null,
        context.subscriptions
      );

      if (!server) {
        server = new WebSocketServer();
      }

      server.clearListeners();
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

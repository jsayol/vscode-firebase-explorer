import * as vscode from 'vscode';
import { postToPanel, readFile, getFilePath } from '../utils';
import { WebSocketServer } from './server';

let context: vscode.ExtensionContext;
let dashboardPanel: vscode.WebviewPanel | undefined;
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

      dashboardPanel.webview.onDidReceiveMessage(async data => {
        switch (data.command) {
          case 'ready':
            isDashboardReady = true;
            postToPanel(dashboardPanel!, {
              command: 'initialize'
            });
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
        await server.start();
      }
    }
  } catch (err) {
    console.log(err);
  }
}

function stopServer(): void {
  if (server) {
    server.stop();
    server = undefined;
  }
}
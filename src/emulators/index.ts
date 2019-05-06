import * as vscode from 'vscode';
import { registerEmulatorsCommands } from './commands';

let statusBarItem: vscode.StatusBarItem;

export function initializeEmulatorsModule(context: vscode.ExtensionContext) {
  registerEmulatorsCommands(context);
  createStatusBarItem(context);
}

function createStatusBarItem(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  statusBarItem.text = '$(flame) Firebase Emulators';
  statusBarItem.tooltip = 'Open the Firebase Emulators Dashboard';
  statusBarItem.command = 'firebaseExplorer.emulators.openDashboard';
  context.subscriptions.push(statusBarItem);

  vscode.workspace.onDidChangeWorkspaceFolders(updateStatusBar);

  // tslint:disable-next-line: no-floating-promises
  updateStatusBar();
}

async function updateStatusBar(): Promise<void> {
  try {
    const foundFiles = await vscode.workspace.findFiles(
      'firebase.json',
      '**/​node_modules*'
    );

    if (foundFiles.length > 0) {
      statusBarItem.show();
    } else {
      statusBarItem.hide();
    }
  } catch (err) {
    statusBarItem.hide();
    console.error(err);
  }
}

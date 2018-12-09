import * as vscode from 'vscode';
import { login } from './login';
import { AccountManager } from './AccountManager';
import { AccountItem } from '../projects/ProjectsProvider';

let context: vscode.ExtensionContext;

export function registerAccountsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand('firebaseExplorer.accounts.add', addAccount)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.accounts.remove',
      removeAccount
    )
  );
}

async function addAccount(): Promise<void> {
  const account = await vscode.window.withProgress(
    {
      title: 'Waiting for login to complete...',
      location: vscode.ProgressLocation.Notification
    },
    () => login()
  );

  if (account) {
    AccountManager.addAccount(account);
  } else {
    vscode.window.showWarningMessage('Failed to add new account.');
  }

  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

function removeAccount(element: AccountItem): void {
  AccountManager.removeAccount(element.account);
  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

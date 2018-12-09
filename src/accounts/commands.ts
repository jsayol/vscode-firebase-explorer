import * as vscode from 'vscode';
import { initiateLogin, endLogin } from './login';
import { AccountManager } from './AccountManager';
import { AccountItem } from '../projects/ProjectsProvider';
import { generateNonce } from '../utils';

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
      location: vscode.ProgressLocation.Notification,
      cancellable: true
    },
    (_, cancelationToken) => {
      const nonce = generateNonce();

      cancelationToken.onCancellationRequested(() => {
        endLogin(nonce);
      });

      return initiateLogin(nonce);
    }
  );

  if (account) {
    AccountManager.addAccount(account);
    vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
  } else {
    vscode.window.showWarningMessage('Failed to add new account.');
  }
}

function removeAccount(element: AccountItem): void {
  AccountManager.removeAccount(element.account);
  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

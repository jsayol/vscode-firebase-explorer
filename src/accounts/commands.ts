import * as vscode from 'vscode';
import { AccountItem } from '../projects/provider';
import { generateNonce, getContext } from '../utils';
import { AccountManager } from './manager';
import { endLogin, initiateLogin } from './login';

export function registerAccountsCommands(context: vscode.ExtensionContext) {
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
  const context = getContext();
  const selectedAccount = AccountManager.getSelectedAccountInfo();

  if (selectedAccount === element.accountInfo) {
    context.globalState.update('selectedAccount', undefined);
    context.globalState.update('selectedProject', undefined);
    vscode.commands.executeCommand('firebaseExplorer.functions.refresh');
    vscode.commands.executeCommand('firebaseExplorer.apps.refresh');
    vscode.commands.executeCommand('firebaseExplorer.firestore.refresh');
    vscode.commands.executeCommand('firebaseExplorer.database.refresh');
  }

  AccountManager.removeAccount(element.accountInfo);
  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

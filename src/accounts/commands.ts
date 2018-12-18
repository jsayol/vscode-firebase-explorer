import * as vscode from 'vscode';
import { AccountItem } from '../projects/ProjectsProvider';
import { generateNonce } from '../utils';
import { AccountManager, AccountInfo } from './AccountManager';
import { endLogin, initiateLogin } from './login';
import { analytics } from '../analytics';
import { ProjectsAPI } from '../projects/api';
import { sendDebugInfo } from '../debug';

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.accounts.debug',
      accountsDebug
    )
  );
}

async function addAccount(): Promise<void> {
  analytics.event('Accounts', 'addAccount');

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
  analytics.event('Accounts', 'removeAccount');

  const selectedAccout = context.globalState.get('selectedAccount');
  if (selectedAccout === element.account) {
    context.globalState.update('selectedAccount', undefined);
    context.globalState.update('selectedProject', undefined);
    vscode.commands.executeCommand('firebaseExplorer.functions.refresh');
    vscode.commands.executeCommand('firebaseExplorer.apps.refresh');
    vscode.commands.executeCommand('firebaseExplorer.firestore.refresh');
    vscode.commands.executeCommand('firebaseExplorer.database.refresh');
  }

  AccountManager.removeAccount(element.account);
  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

async function accountsDebug(): Promise<void> {
  analytics.event('Accounts', 'accountsDebug');

  let account = context.globalState.get<AccountInfo>('selectedAccount');

  if (!account) {
    const accounts = AccountManager.getAccounts();

    if (accounts.length === 0) {
      return;
    }

    if (accounts.length === 1) {
      account = accounts[0];
    } else {
      const accountPick = await vscode.window.showQuickPick(
        accounts.map(account => ({ label: account.user.email, account })),
        {
          placeHolder: 'Select an account'
        }
      );

      if (!accountPick) {
        return;
      }

      account = accountPick.account;
    }
  }

  if (!account) {
    return;
  }

  const pick = await vscode.window.showQuickPick(['Send projects list'], {
    placeHolder: 'Select the debug option to run'
  });

  switch (pick) {
    case 'Send projects list':
      const confirm = await vscode.window.showInformationMessage(
        'Proceed to send debug information? This includes your email address and a list of your projects.',
        'Send'
      );

      if (confirm === 'Send') {
        await vscode.window.withProgress(
          {
            title: 'Collecting projects list...',
            location: vscode.ProgressLocation.Notification
          },
          async () => {
            const api = ProjectsAPI.for(account!);
            const projects = await api.getDebugData();
            return sendDebugInfo('projects', {
              account: account!.user.email,
              projects
            });
          }
        );
      }
      break;
  }
}

import * as vscode from 'vscode';
import { AccountInfo } from './interfaces';
import { getCliAccount } from './cli';
import { login } from './login';

let context: vscode.ExtensionContext;

export function registerAccountsCommands(_context: vscode.ExtensionContext) {
  context = _context;
  context.subscriptions.push(
    vscode.commands.registerCommand('firebaseExplorer.options', optionsCommand)
  );
}

async function optionsCommand(): Promise<void> {
  const accounts = context.globalState.get<AccountInfo[]>('accounts');

  if (!Array.isArray(accounts)) {
    const cliAccount = getCliAccount();

    if (cliAccount !== null) {
      // offer to use cli account
      addAccount(cliAccount);
    } else {
      const account = await login();
      if (account) {
        addAccount(account);
      }
    }
  }

  showAccounts();
}

/******* Helpers ********/

function getAccounts(): AccountInfo[] {
  let accounts = context.globalState.get<AccountInfo[]>('accounts');

  if (!Array.isArray(accounts)) {
    accounts = [];
  }

  return accounts;
}

function setAccounts(accounts: AccountInfo[]): Thenable<void> {
  return context.globalState.update('accounts', accounts);
}

function addAccount(account: AccountInfo): Thenable<void> {
  const accounts = getAccounts();
  accounts.push(account);
  return setAccounts(accounts);
}

function showAccounts(): void {
  vscode.commands.executeCommand('firebaseExplorer.projects.refresh');
}

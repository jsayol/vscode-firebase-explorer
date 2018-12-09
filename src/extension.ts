import * as vscode from 'vscode';
import { getCliAccount } from './accounts/cli';
import { ProviderStore } from './ProviderStore';
import { AppsProvider } from './apps/AppsProvider';
import { AccountManager } from './accounts/AccountManager';
import { ProjectsProvider } from './projects/ProjectsProvider';
import { DatabaseProvider } from './database/DatabaseProvider';
import { FirestoreProvider } from './firestore/FirestoreProvider';
import { registerAppsCommands } from './apps/commands';
import { registerAccountsCommands } from './accounts/commands';
import { registerProjectsCommands } from './projects/commands';
import { registerFirestoreCommands } from './firestore/commands';
import { registerDatabaseCommands } from './database/commands';
import { setContextObj, EXTENSION_VERSION } from './utils';

export async function activate(context: vscode.ExtensionContext) {
  setContextObj(context);

  // Wait for initialization if it's the first run
  await firstRunCheck(context);

  // Clean-up any previous selections
  context.globalState.update('selectedAccount', void 0);
  context.globalState.update('selectedProject', void 0);

  registerProvider('apps', new AppsProvider(context));
  registerProvider('projects', new ProjectsProvider(/*context*/));
  registerProvider('firestore', new FirestoreProvider(context));
  registerProvider('database', new DatabaseProvider(context));

  registerAppsCommands(context);
  registerAccountsCommands(context);
  registerProjectsCommands(context);
  registerFirestoreCommands(context);
  registerDatabaseCommands(context);
}

export function deactivate() {
  // ...
}

function registerProvider<T>(
  name: string,
  provider: vscode.TreeDataProvider<T>
) {
  ProviderStore.add(name, provider);
  vscode.window.registerTreeDataProvider(`firebase-${name}`, provider);
}

async function firstRunCheck(context: vscode.ExtensionContext): Promise<void> {
  // context.globalState.update('config', undefined);

  let extensionConfig = context.globalState.get<ExtensionConfig>('config');

  if (!extensionConfig) {
    // It's the first time we load the extension. Hello world!
    extensionConfig = { version: EXTENSION_VERSION };
    context.globalState.update('config', extensionConfig);
    context.globalState.update('accounts', undefined);

    // Let's try loading the account stored by the Firebase CLI
    const cliAccount = await getCliAccount();
    if (cliAccount !== null) {
      // Found it! Let's add it to the extension accounts
      AccountManager.addAccount(cliAccount);
      vscode.window.showInformationMessage(
        `Detected new account: ${cliAccount.user.email}`
      );
    }
  }
}

export interface ExtensionConfig {
  version: number;
}

import * as vscode from 'vscode';
import * as semver from 'semver';
import { getCliAccount } from './accounts/cli';
import { ProviderStore, TreeViewStore } from './stores';
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
import { setContextObj } from './utils';
import { registerFunctionsCommands } from './functions/commands';
import { FunctionsProvider } from './functions/FunctionsProvider';

export async function activate(context: vscode.ExtensionContext) {
  setContextObj(context);

  // Wait for initialization
  await initialize(context);

  // Clean-up any previous selections
  context.globalState.update('selectedAccount', void 0);
  context.globalState.update('selectedProject', void 0);

  registerProvider('functions', new FunctionsProvider(context));
  registerProvider('apps', new AppsProvider(context));
  registerProvider('projects', new ProjectsProvider(/*context*/));
  registerProvider('firestore', new FirestoreProvider(context));
  registerProvider('database', new DatabaseProvider(context));

  registerFunctionsCommands(context);
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
  const treeView = vscode.window.createTreeView(`firebase-${name}`, {
    treeDataProvider: provider
  });
  TreeViewStore.add(name, treeView);
  ProviderStore.add(name, provider);
  // vscode.window.registerTreeDataProvider(`firebase-${name}`, provider);
}

async function initialize(context: vscode.ExtensionContext): Promise<void> {
  if (!PRODUCTION) {
    // context.globalState.update('config', undefined);
  }

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
    } else {
      showSignInPrompt();
    }
  }

  if (!semver.eq(extensionConfig.version, EXTENSION_VERSION)) {
    // The extension has updated. Perform any necessary upgrades to the config.

    if (semver.lte(extensionConfig.version, '0.0.2')) {
      // After 0.0.2 we changed the way we log in (different clientId).
      // Any accounts we logged in up to that version are no longer valid.
      // Accounts imported from the CLI are not affected.
      const allAccounts = AccountManager.getAccounts();
      const goodAccounts = allAccounts.filter(
        account => account.origin !== 'login'
      );

      if (allAccounts.length !== goodAccounts.length) {
        AccountManager.setAccounts(goodAccounts);
        showSignInPrompt(
          'Hey there! We made some changes to the extension. You will need to sign in again to continue. Sorry about that!'
        );
      }
    }

    // Set the updated extension version
    extensionConfig.version = EXTENSION_VERSION;

    // Store the updated config
    context.globalState.update('config', extensionConfig);
  }
}

async function showSignInPrompt(msg?: string) {
  const buttonText = 'Sign In';
  const action = await vscode.window.showInformationMessage(
    msg ||
      'Hello! Please sign in with your Google account to start using Firebase Explorer.',
    buttonText
  );

  if (action === buttonText) {
    vscode.commands.executeCommand('firebaseExplorer.accounts.add');
  }
}

export interface ExtensionConfig {
  version: string;
}

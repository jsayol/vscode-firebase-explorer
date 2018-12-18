import * as semver from 'semver';
import * as vscode from 'vscode';
import { AccountManager } from './accounts/AccountManager';
import { getCliAccount } from './accounts/cli';
import { registerAccountsCommands } from './accounts/commands';
import { analytics } from './analytics';
import { AppsProvider } from './apps/AppsProvider';
import { registerAppsCommands } from './apps/commands';
import { registerDatabaseCommands } from './database/commands';
import { DatabaseProvider } from './database/DatabaseProvider';
import { registerFirestoreCommands } from './firestore/commands';
import { FirestoreProvider } from './firestore/FirestoreProvider';
import { registerFunctionsCommands } from './functions/commands';
import { FunctionsProvider } from './functions/FunctionsProvider';
import { registerHostingCommands } from './hosting/commands';
import { HostingProvider } from './hosting/HostingProvider';
import { registerProjectsCommands } from './projects/commands';
import { ProjectsProvider } from './projects/ProjectsProvider';
import { providerStore, treeViewStore } from './stores';
import { setContextObj } from './utils';

export async function activate(context: vscode.ExtensionContext) {
  setContextObj(context);

  // Wait for initialization
  await initialize(context);

  // Clean-up any previous selections
  context.globalState.update('selectedAccount', void 0);
  context.globalState.update('selectedProject', void 0);

  registerProvider('hosting', new HostingProvider(context));
  registerProvider('functions', new FunctionsProvider(context));
  registerProvider('apps', new AppsProvider(context));
  registerProvider('projects', new ProjectsProvider(/*context*/));
  registerProvider('firestore', new FirestoreProvider(context));
  registerProvider('database', new DatabaseProvider(context));

  registerHostingCommands(context);
  registerFunctionsCommands(context);
  registerAppsCommands(context);
  registerAccountsCommands(context);
  registerProjectsCommands(context);
  registerFirestoreCommands(context);
  registerDatabaseCommands(context);

  analytics.event('Extension', 'activate');
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
  treeViewStore.add(name, treeView);
  providerStore.add(name, provider);
  // vscode.window.registerTreeDataProvider(`firebase-${name}`, provider);
}

async function initialize(context: vscode.ExtensionContext): Promise<void> {
  if (!PRODUCTION) {
    // context.globalState.update('config', undefined);
  }

  // Initialize analytics
  analytics.initialize(context);

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
    } else if (semver.eq(extensionConfig.version, '0.1.0')) {
      // The accounts added while on this version always use the CLI clientID,
      // but are stored as "login" origin. This doesn't affect the functionality
      // of the extension (we always use the CLI clientId for now) but better
      // to set the right value just in case. Future-proofing!
      const accounts = AccountManager.getAccounts();
      let hasChanges = false;

      accounts.forEach(account => {
        if (account.origin !== 'cli') {
          account.origin = 'cli';
          hasChanges = true;
        }
      });

      if (hasChanges) {
        AccountManager.setAccounts(accounts);
      }
    }

    // Set the updated extension version
    extensionConfig.version = EXTENSION_VERSION;

    // Store the updated config
    context.globalState.update('config', extensionConfig);
  }
}

function showSignInPrompt(msg?: string): void {
  const buttonText = 'Sign In';
  const message =
    msg ||
    'Hello! Please sign in with your Google account to start using Firebase Explorer.';

  vscode.window.showInformationMessage(message, buttonText).then(action => {
    if (action === buttonText) {
      vscode.commands.executeCommand('firebaseExplorer.accounts.add');
    }
  });
}

export interface ExtensionConfig {
  version: string;
}

import * as semver from 'semver';
import * as vscode from 'vscode';
import * as chardet from 'chardet';
import * as iconv from 'iconv-lite';
import {
  AccountManager,
  AccountInfo,
  StateAccounts,
  AccountData
} from './accounts/AccountManager';
import { getCliAccount } from './accounts/cli';
import { registerAccountsCommands } from './accounts/commands';
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
import { setContextObj, readFile } from './utils';
import { StorageProvider } from './storage/StorageProvider';

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
  registerProvider('storage', new StorageProvider(context));

  registerHostingCommands(context);
  registerFunctionsCommands(context);
  registerAppsCommands(context);
  registerAccountsCommands(context);
  registerProjectsCommands(context);
  registerFirestoreCommands(context);
  registerDatabaseCommands(context);

  // This adds a custom schema to open files as read-only
  vscode.workspace.registerTextDocumentContentProvider(
    'firebase-explorer-readonly',
    {
      async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        try {
          const buffer = await readFile(uri.path);
          const charset = chardet.detect(buffer, {
            returnAllMatches: false
          }) as string | undefined;
          return iconv.decode(buffer, charset || 'utf8');
        } catch (err) {
          console.log(err);
          throw err;
        }
      }
    }
  );
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

  if (PRODUCTION && !semver.eq(extensionConfig.version, EXTENSION_VERSION)) {
    // The extension has updated. Perform any necessary upgrades to the config.

    // IMPORTANT: Always manipulate "context.globalState" directly inside this
    // block. Do not rely on any other methods to get/set its data since the
    // data they expect might not match what we actually have.

    if (semver.lte(extensionConfig.version, '0.0.2')) {
      /*
       After 0.0.2 we changed the way we log in (different clientId).
       Any accounts we logged in up to that version are no longer valid.
       Accounts imported from the CLI are not affected.
       */
      const allAccounts =
        context.globalState.get<AccountInfo[]>('accounts') || [];
      const goodAccounts = allAccounts.filter(
        account => account.origin !== 'login'
      );

      if (allAccounts.length !== goodAccounts.length) {
        context.globalState.update('accounts', goodAccounts);
        showSignInPrompt(
          'Hey there! We made some changes to the extension. You will need to sign in again to continue. Sorry about that!'
        );
      }
    }

    if (semver.eq(extensionConfig.version, '0.1.0')) {
      /*
       The accounts added while on this version always use the CLI clientID,
       but are stored as "login" origin. This doesn't affect the functionality
       of the extension (we always use the CLI clientId for now) but better
       to set the right value just in case. Future-proofing!
       */
      let hasChanges = false;
      const accounts = context.globalState.get<AccountInfo[]>('accounts') || [];

      accounts.forEach(account => {
        if (account.origin !== 'cli') {
          account.origin = 'cli';
          hasChanges = true;
        }
      });

      if (hasChanges) {
        context.globalState.update('accounts', accounts);
      }
    }

    if (semver.lte(extensionConfig.version, '0.3.3')) {
      /*
       Until 0.3.3, the "accounts" globalState entry was an array of accounts,
       with each element being an AccountInfo object.
       We migrate "accounts" into an object where each key is an account email,
       and each value is an AccountData object:
           interface AccountData {
             info: AccountInfo;
             projects: FirebaseProject[];
           }
       */
      const oldAccounts = context.globalState.get<AccountInfo[]>('accounts');
      const newAccounts: StateAccounts = {};

      (oldAccounts || []).forEach((info: AccountInfo) => {
        const account: AccountData = {
          info,
          projects: null
        };
        newAccounts[info.user.email] = account;
      });

      context.globalState.update('accounts', newAccounts);
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

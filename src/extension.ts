import * as vscode from 'vscode';
import { login } from './accounts/login';
import { ProjectsProvider } from './projects/ProjectsProvider';
import { AccountInfo } from './accounts/interfaces';
import { getCliAccount } from './accounts/cli';
import { FirestoreProvider } from './firestore/FirestoreProvider';
import { FirebaseProject } from './projects/ProjectManager';
import { AppsProvider } from './apps/AppsProvider';
import { ProviderStore } from './ProviderStore';
import { FirestoreAPI } from './firestore/api';
import { DatabaseProvider } from './database/DatabaseProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Extension "firebaseExplorer" is now active!');

  // Clean-up any previous selections
  context.globalState.update('selectedAccount', null);
  context.globalState.update('selectedProject', null);

  registerProviders(context);
  registerCommands(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
  // ...
}

function registerCommands(context: vscode.ExtensionContext) {
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with  registerCommand
  // The commandId parameter must match the command field in package.json
  let sayHello = vscode.commands.registerCommand(
    'firebaseExplorer.sayHello',
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage('Hello World!');
    }
  );

  let projectSelection = vscode.commands.registerCommand(
    'firebaseExplorer.projectSelection',
    async (account: AccountInfo, project: FirebaseProject) => {
      const currentAccount = context.globalState.get<AccountInfo>(
        'selectedAccount'
      );
      const currentProject = context.globalState.get<FirebaseProject>(
        'selectedProject'
      );

      if (account === currentAccount && project === currentProject) {
        return;
      }

      context.globalState.update('selectedAccount', account);
      context.globalState.update('selectedProject', project);

      const appsProvider = ProviderStore.get<FirestoreProvider>('apps');
      appsProvider.refresh();

      const firestoreProvider = ProviderStore.get<FirestoreProvider>(
        'firestore'
      );
      firestoreProvider.refresh();

      const databaseProvider = ProviderStore.get<DatabaseProvider>('database');
      databaseProvider.refresh();

      // const databaseProvider = getProvider<DatabaseProvider>('database');
      // databaseProvider.refresh();

      /******* tests *******/

      // const appName = `vscode--${account.user.email}--${project.id}`;
      // let app: firebaseAdmin.app.App;

      // try {
      //   app = firebaseAdmin.app(appName);
      // } catch (err) {
      //   const token = account.tokens.refresh_token;
      //   const config = await firebaseTools.setup.web({
      //     project: project.id,
      //     token
      //   });

      //   const credential = firebaseAdmin.credential.refreshToken({
      //     type: 'authorized_user',
      //     refresh_token: account.tokens.refresh_token,
      //     client_id:
      //       account.origin === 'cli' ? APIforCLI.clientId : API.clientId,
      //     client_secret:
      //       account.origin === 'cli' ? APIforCLI.clientSecret : API.clientSecret
      //   });

      //   app = firebaseAdmin.initializeApp({ ...config, credential }, appName);
      // }

      // console.log('Getting database...');
      // const ref = app.database().ref();
      // ref.once(
      //   'value',
      //   snap => {
      //     console.log(snap.val());
      //   },
      //   (err: any) => {
      //     console.error(err);
      //   }
      // );
    }
  );

  let refreshProjects = vscode.commands.registerCommand(
    'firebaseExplorer.refreshProjectsView',
    () => {
      const projectsProvider = ProviderStore.get<ProjectsProvider>('projects');
      projectsProvider.refresh();
    }
  );

  let documentSelection = vscode.commands.registerCommand(
    'firebaseExplorer.documentSelection',
    async (account: AccountInfo, project: FirebaseProject, docPath: string) => {
      console.log('Getting document', docPath);
      const api = FirestoreAPI.for(account, project);
      const doc = await api.getDocument(docPath);
      console.log(doc);
    }
  );

  let fbOptions = vscode.commands.registerCommand(
    'firebaseExplorer.options',
    async () => {
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
  );

  context.subscriptions.push(sayHello);
  context.subscriptions.push(fbOptions);
  context.subscriptions.push(refreshProjects);
  context.subscriptions.push(projectSelection);
  context.subscriptions.push(documentSelection);

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

  function showAccounts() {
    vscode.commands.executeCommand('firebaseExplorer.refreshProjectsView');
  }
}

function registerProviders(context: vscode.ExtensionContext) {
  registerProvider('projects', new ProjectsProvider(context));
  registerProvider('apps', new AppsProvider(context));
  registerProvider('firestore', new FirestoreProvider(context));
  registerProvider('database', new DatabaseProvider(context));
}

function registerProvider<T>(
  name: string,
  provider: vscode.TreeDataProvider<T>
) {
  ProviderStore.add(name, provider);
  vscode.window.registerTreeDataProvider(`firebase-${name}`, provider);
}

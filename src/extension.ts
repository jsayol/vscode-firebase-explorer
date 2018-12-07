import * as vscode from 'vscode';
import { ProviderStore } from './ProviderStore';
import { AppsProvider } from './apps/AppsProvider';
import { ProjectsProvider } from './projects/ProjectsProvider';
import { DatabaseProvider } from './database/DatabaseProvider';
import { FirestoreProvider } from './firestore/FirestoreProvider';
import { registerAppsCommands } from './apps/commands';
import { registerAccountsCommands } from './accounts/commands';
import { registerProjectsCommands } from './projects/commands';
import { registerFirestoreCommands } from './firestore/commands';
import { registerDatabaseCommands } from './database/commands';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Extension "firebaseExplorer" is now active!');

  // Clean-up any previous selections
  context.globalState.update('selectedAccount', void 0);
  context.globalState.update('selectedProject', void 0);

  registerProvider('apps', new AppsProvider(context));
  registerProvider('projects', new ProjectsProvider(context));
  registerProvider('firestore', new FirestoreProvider(context));
  registerProvider('database', new DatabaseProvider(context));

  registerAppsCommands(context);
  registerAccountsCommands(context);
  registerProjectsCommands(context);
  registerFirestoreCommands(context);
  registerDatabaseCommands(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
  // ...
}

const treeViews: { [k: string]: vscode.TreeView<any> } = {};

function registerProvider<T>(
  name: string,
  provider: vscode.TreeDataProvider<T>
) {
  const treeView = vscode.window.createTreeView(`firebase-${name}`, {
    treeDataProvider: provider
  });
  treeViews[name] = treeView;
  ProviderStore.add(name, provider);
  // vscode.window.registerTreeDataProvider(`firebase-${name}`, provider);
}

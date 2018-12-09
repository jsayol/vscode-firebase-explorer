import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import { ProviderStore } from '../ProviderStore';
import { FirebaseProject } from '../projects/ProjectManager';
import { ProjectsProvider } from '../projects/ProjectsProvider';
import { FirestoreProvider } from '../firestore/FirestoreProvider';
import { DatabaseProvider } from '../database/DatabaseProvider';
import { setContext, ContextValue } from '../utils';
import { AppsProvider } from '../apps/AppsProvider';

let context: vscode.ExtensionContext;

export function registerProjectsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.projects.refresh',
      refreshProjects
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.projects.selection',
      projectSelection
    )
  );
}

function projectSelection(
  account: AccountInfo,
  project: FirebaseProject
): void {
  const currentAccount = context.globalState.get<AccountInfo>(
    'selectedAccount'
  );
  const currentProject = context.globalState.get<FirebaseProject>(
    'selectedProject'
  );

  if (account === currentAccount && project === currentProject) {
    return;
  }

  // if (account) {
  //   const m = AccountManager.for(account);
  //   m.getAccessToken().then(token => console.log(token));
  // }

  const appsProvider = ProviderStore.get<AppsProvider>('apps');
  const firestoreProvider = ProviderStore.get<FirestoreProvider>('firestore');
  const databaseProvider = ProviderStore.get<DatabaseProvider>('database');

  setContext(ContextValue.ProjectSelected, false);
  setContext(ContextValue.AppsLoaded, false);
  setContext(ContextValue.FirestoreLoaded, false);
  setContext(ContextValue.DatabaseLoaded, false);

  // Empty selection and refresh to show "Loading..."
  context.globalState.update('selectedAccount', null);
  context.globalState.update('selectedProject', null);
  appsProvider.refresh();
  firestoreProvider.refresh();
  databaseProvider.refresh();

  setTimeout(() => {
    // Re-populate the treeviews for the selected project
    context.globalState.update('selectedAccount', account);
    context.globalState.update('selectedProject', project);
    appsProvider.refresh();
    firestoreProvider.refresh();
    databaseProvider.refresh();
    setContext(ContextValue.ProjectSelected, !!(account && project));
  }, 250);
}

function refreshProjects(): void {
  const projectsProvider = ProviderStore.get<ProjectsProvider>('projects');
  projectsProvider.refresh();
}

import * as vscode from 'vscode';
import { ProviderStore } from '../stores';
import { FirebaseProject } from '../projects/ProjectManager';
import { ProjectsProvider, AccountItem } from '../projects/ProjectsProvider';
import { FirestoreProvider } from '../firestore/FirestoreProvider';
import { DatabaseProvider } from '../database/DatabaseProvider';
import { setContext, ContextValue } from '../utils';
import { AppsProvider } from '../apps/AppsProvider';
import { AccountInfo } from '../accounts/AccountManager';
import { FunctionsProvider } from '../functions/FunctionsProvider';

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

  const functionsProvider = ProviderStore.get<FunctionsProvider>('functions');
  const appsProvider = ProviderStore.get<AppsProvider>('apps');
  const firestoreProvider = ProviderStore.get<FirestoreProvider>('firestore');
  const databaseProvider = ProviderStore.get<DatabaseProvider>('database');

  setContext(ContextValue.ProjectSelected, false);
  setContext(ContextValue.FunctionsLoaded, false);
  setContext(ContextValue.AppsLoaded, false);
  setContext(ContextValue.FirestoreLoaded, false);
  setContext(ContextValue.DatabaseLoaded, false);

  // Empty selection and refresh to show "Loading..."
  context.globalState.update('selectedAccount', null);
  context.globalState.update('selectedProject', null);
  functionsProvider.refresh();
  appsProvider.refresh();
  firestoreProvider.refresh();
  databaseProvider.refresh();

  setTimeout(() => {
    // Re-populate the treeviews for the selected project
    context.globalState.update('selectedAccount', account);
    context.globalState.update('selectedProject', project);
    functionsProvider.refresh();
    appsProvider.refresh();
    firestoreProvider.refresh();
    databaseProvider.refresh();
    setContext(ContextValue.ProjectSelected, !!(account && project));
  }, 250);
}

function refreshProjects(element?: AccountItem): void {
  const projectsProvider = ProviderStore.get<ProjectsProvider>('projects');
  projectsProvider.refresh(element);
}

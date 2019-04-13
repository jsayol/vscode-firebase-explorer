import * as vscode from 'vscode';
import { DatabaseElementItem, DatabaseProvider } from './DatabaseProvider';
import { getFullPath } from '../utils';
import { DatabaseAPI } from './api';
import { providerStore } from '../stores';

export function registerDatabaseCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.refresh',
      refreshDatabase
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.editEntryValue',
      editEntryValue
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.deleteEntry',
      deleteEntry
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.copyName',
      copyName
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.copyPath',
      copyPath
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.copySnippet.JS.ref',
      copySnippetJS_ref
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.database.copySnippet.JS.onValue',
      copySnippetJS_OnValue
    )
  );
}

function refreshDatabase(): void {
  const provider = providerStore.get<DatabaseProvider>('database');
  provider.refresh();
}

async function editEntryValue(element: DatabaseElementItem): Promise<void> {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);
  let newValueStr = await vscode.window.showInputBox({
    placeHolder: 'Enter value',
    value: JSON.stringify(element.value),
    prompt: `Enter value for /${fullPath}`
  });

  if (newValueStr !== undefined) {
    vscode.window.withProgress(
      {
        title: 'Updating database value...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        try {
          let newValue: any;
          newValueStr = newValueStr!.trim();

          try {
            newValue = JSON.parse(newValueStr);
          } catch (err) {
            newValue = newValueStr;
          }

          const api = DatabaseAPI.for(element.account, element.project);
          const response = await api.setValue(fullPath, newValue, element.instance);

          if (response.statusCode !== 200) {
            throw new Error(response.body);
          }

          if (typeof newValue === 'object') {
            element.value = undefined;
            element.label = element.name;
            element.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
          } else {
            element.value = newValue;
          }

          const databaseProvider = providerStore.get<DatabaseProvider>(
            'database'
          );
          databaseProvider.refresh(element);
        } catch (err) {
          vscode.window.showErrorMessage(
            'Failed to update the value on the database',
            err
          );
          console.error(err);
        }
      }
    );
  }
}

async function deleteEntry(element: DatabaseElementItem): Promise<void> {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);

  const confirmation = await vscode.window.showWarningMessage(
    'All data at this location, including nested data, will be permanently deleted!\n\n' +
      `/${fullPath}`,
    { modal: true },
    'Delete'
  );

  if (confirmation === 'Delete') {
    vscode.window.withProgress(
      {
        title: 'Removing database entry...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        try {
          const api = DatabaseAPI.for(element.account, element.project);
          const response = await api.remove(fullPath, element.instance);
          if (response.statusCode !== 200) {
            throw new Error(response.body);
          }
          const databaseProvider = providerStore.get<DatabaseProvider>(
            'database'
          );
          element.markAsRemoved();
          databaseProvider.refresh(element);
        } catch (err) {
          vscode.window.showErrorMessage(
            'Failed to update the value on the database',
            err
          );
          console.error(err);
        }
      }
    );
  }
}

function copyName(element: DatabaseElementItem): void {
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(element.name);
}

function copyPath(element: DatabaseElementItem): void {
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(
    '/' + getFullPath(element.parentPath, element.name)
  );
}

function copySnippetJS_ref(element: DatabaseElementItem): void {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);
  vscode.env.clipboard.writeText(`firebase.database().ref('${fullPath}')`);
}

function copySnippetJS_OnValue(element: DatabaseElementItem): void {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);
  vscode.env.clipboard.writeText(
    [
      `const ref = firebase.database().ref('${fullPath}');`,
      `ref.on('value', (snapshot) => {`,
      `  const value = snapshot.val();`,
      `  // ...`,
      `});`
    ].join('\n')
  );
}

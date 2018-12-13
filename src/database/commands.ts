import * as vscode from 'vscode';
import { DatabaseProviderItem, DatabaseProvider } from './DatabaseProvider';
import { getFullPath } from '../utils';
import { DatabaseAPI } from './api';
import { ProviderStore } from '../stores';

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
}

function refreshDatabase(): void {
  const provider = ProviderStore.get<DatabaseProvider>('database');
  provider.refresh();
}

async function editEntryValue(element: DatabaseProviderItem): Promise<void> {
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
          const response = await api.setValue(fullPath, newValue);

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

          const databaseProvider = ProviderStore.get<DatabaseProvider>(
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

async function deleteEntry(element: DatabaseProviderItem): Promise<void> {
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
          const response = await api.remove(fullPath);
          if (response.statusCode !== 200) {
            throw new Error(response.body);
          }
          const databaseProvider = ProviderStore.get<DatabaseProvider>(
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

function copyName(element: DatabaseProviderItem): void {
  vscode.env.clipboard.writeText(element.name);
}

function copyPath(element: DatabaseProviderItem): void {
  vscode.env.clipboard.writeText('/' + getFullPath(element.parentPath, element.name));
}

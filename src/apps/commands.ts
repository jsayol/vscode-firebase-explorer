import * as vscode from 'vscode';
import { AppsProviderItem, AppsProvider } from './AppsProvider';
import { IosApp, AndroidApp } from '../projects/ProjectManager';
import { ProviderStore } from '../ProviderStore';

let context: vscode.ExtensionContext;

export function registerAppsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.refresh',
      refreshApps
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.editAppName',
      editAppName
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.showAppConfig',
      showAppConfig
    )
  );
}

function refreshApps(): void {
  const appsProvider = ProviderStore.get<AppsProvider>('apps');
  appsProvider.refresh();
}

async function editAppName(element: AppsProviderItem): Promise<void> {
  const app: IosApp | AndroidApp = element.app;
  let packageName: string;

  if (element.contextValue === 'apps.iosApp') {
    packageName = (app as IosApp).metadata.bundleId;
  } else if (element.contextValue === 'apps.androidApp') {
    packageName = (app as AndroidApp).metadata.packageName;
  } else {
    console.error('Not a know app type!');
    return;
  }

  const newName = await vscode.window.showInputBox({
    placeHolder: packageName,
    value: app.metadata.displayName || '',
    prompt: `Enter new name for app ${packageName}`
  });

  if (newName !== undefined) {
    vscode.window.withProgress(
      {
        title: 'Updating app name...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        try {
          await app.app.setDisplayName(newName);
          element.label = newName;
          element.app.metadata.displayName = newName;

          const appsProvider = ProviderStore.get<AppsProvider>('apps');
          appsProvider.refresh(element);
        } catch (err) {
          vscode.window.showErrorMessage(
            "Failed to update app's display name",
            err
          );
          console.error(err);
        }
      }
    );
  }
}

function showAppConfig(element: AppsProviderItem): void {
  vscode.window.withProgress(
    {
      title: 'Loading configuration...',
      location: vscode.ProgressLocation.Notification
    },
    async () => {
      let language: string;

      if (element.contextValue === 'apps.iosApp') {
        language = 'xml';
      } else if (element.contextValue === 'apps.androidApp') {
        language = 'json';
      } else {
        console.error('Not a know app type!');
        return;
      }

      const config = await element.app.app.getConfig();

      const textDocument = await vscode.workspace.openTextDocument({
        language,
        content: config
      });

      const textEditor = await vscode.window.showTextDocument(textDocument);
      console.log(textEditor);
    }
  );
}

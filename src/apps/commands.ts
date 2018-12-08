import * as vscode from 'vscode';
import * as clipboardy from 'clipboardy';
import {
  AppsProviderItem,
  AppsProvider,
  FingerprintFolderItem,
  FingerprintItem
} from './AppsProvider';
import { ProviderStore } from '../ProviderStore';
import { IosApp, AndroidApp, ShaCertificate } from './apps';
import { getCertTypeForFingerprint } from '../utils';

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.addAppCertificate',
      addAppCertificate
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.copyAppCertificate',
      copyAppCertificate
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.deleteAppCertificate',
      deleteAppCertificate
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
    packageName = (app as IosApp).bundleId;
  } else if (element.contextValue === 'apps.androidApp') {
    packageName = (app as AndroidApp).packageName;
  } else {
    console.error('Not a know app type!');
    return;
  }

  const newName = await vscode.window.showInputBox({
    placeHolder: packageName,
    value: app.displayName || '',
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
          await app.setDisplayName(newName);
          element.label = newName;

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
      title: `Loading configuration for "${element.app.appName}" ...`,
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

      const config = await element.app.getConfig();

      const textDocument = await vscode.workspace.openTextDocument({
        language,
        content: config
      });

      return vscode.window.showTextDocument(textDocument);
    }
  );
}

async function addAppCertificate(
  element: FingerprintFolderItem,
  retryValue?: string
): Promise<void> {
  const shaHash = await vscode.window.showInputBox({
    placeHolder:
      '00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00',
    value: retryValue !== undefined ? retryValue : '',
    prompt:
      retryValue !== undefined
        ? 'This is not a valid SHA-1 or SHA-256 fingerprint'
        : `Enter SHA-1 or SHA-256 fingerprint`
  });

  if (shaHash !== undefined) {
    const certType = getCertTypeForFingerprint(shaHash);

    if (certType === null) {
      return addAppCertificate(element, shaHash);
    } else {
      vscode.window.withProgress(
        {
          title: 'Adding new fingerprint...',
          location: vscode.ProgressLocation.Notification
        },
        async () => {
          try {
            const cert: ShaCertificate = { shaHash, certType };
            await element.app.addShaCertificate(cert);

            const appsProvider = ProviderStore.get<AppsProvider>('apps');
            appsProvider.refresh(element.appItem);
          } catch (err) {
            vscode.window.showErrorMessage(
              'Failed to add new certificate fingerprint',
              err
            );
            console.error(err);
          }
        }
      );
    }
  }
}

function copyAppCertificate(element: FingerprintItem): void {
  clipboardy.write(element.label!);
}

async function deleteAppCertificate(element: FingerprintItem): Promise<void> {
  const confirmation = await vscode.window.showWarningMessage(
    'Delete certificate fingerprint?\n' +
      'Warning: Any calls made to a Google API signed with this certificate may fail.\n\n' +
      `App: ${element.app.appName}\n` +
      `Fingerprint: ${element.label}`,
    { modal: true },
    'Delete'
  );

  if (confirmation === 'Delete') {
    vscode.window.withProgress(
      {
        title: 'Deleting fingerprint...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        try {
          await element.app.deleteShaCertificate(element.cert);
          const appsProvider = ProviderStore.get<AppsProvider>('apps');
          appsProvider.refresh(element.folderItem);
        } catch (err) {
          vscode.window.showErrorMessage(
            'Failed to delete certificate fingerprint',
            err
          );
          console.error(err);
        }
      }
    );
  }
}

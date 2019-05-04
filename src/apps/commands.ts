import * as vscode from 'vscode';
import {
  AppsProviderItem,
  AppsProvider,
  FingerprintFolderItem,
  FingerprintItem
} from './AppsProvider';
import { providerStore } from '../stores';
import { IosApp, AndroidApp, ShaCertificate } from './apps';
import {
  getCertTypeForFingerprint,
  writeToTmpFile,
  getContext
} from '../utils';
import { FirebaseProject } from '../projects/ProjectManager';
import { AppsAPI } from './api';
import { AccountInfo } from '../accounts/AccountManager';

export function registerAppsCommands(context: vscode.ExtensionContext) {
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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.apps.create',
      createNewApp
    )
  );
}

function refreshApps(): void {
  const appsProvider = providerStore.get<AppsProvider>('apps');
  appsProvider.refresh();
}

async function editAppName(element: AppsProviderItem): Promise<void> {
  if (!element) {
    return;
  }

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
          const success = await app.setDisplayName(newName);
          if (success) {
            element.label = newName;
            const appsProvider = providerStore.get<AppsProvider>('apps');
            appsProvider.refresh(element);
          }
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
  if (!element) {
    return;
  }

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
      const tmpFile = await writeToTmpFile(config || '', {
        prefix: 'appconfig-',
        postfix: '.' + language
      });

      const textDocument = await vscode.workspace.openTextDocument(
        vscode.Uri.parse('firebase-explorer-readonly:' + tmpFile.path)
      );

      return vscode.window.showTextDocument(textDocument);
    }
  );
}

async function addAppCertificate(
  element: FingerprintFolderItem,
  retryValue?: string
): Promise<void> {
  if (!element) {
    return;
  }

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

            const appsProvider = providerStore.get<AppsProvider>('apps');
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
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(element.label!);
}

async function deleteAppCertificate(element: FingerprintItem): Promise<void> {
  if (!element) {
    return;
  }

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
          const appsProvider = providerStore.get<AppsProvider>('apps');
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

async function createNewApp(): Promise<void> {
  const appOptions: (vscode.QuickPickItem & {
    options: { type: string; field: string; prompt: string };
  })[] = [
    {
      label: 'Android app',
      // description: 'Add an Android app',
      detail: 'Choose this option to add an Android app to the project',
      options: {
        type: 'android',
        field: 'packageName',
        prompt: 'Enter Android package name'
      }
    },
    {
      label: 'iOS app',
      // description: 'Add an iOS app',
      detail: 'Choose this option to add an iOS app to the project',
      options: {
        type: 'ios',
        field: 'bundleId',
        prompt: 'Enter iOS bundle ID'
      }
    }
  ];

  const pick = await vscode.window.showQuickPick(appOptions, {
    ignoreFocusOut: true
  });

  if (!pick) {
    return;
  }

  const name = await promptAppName(pick.options);

  if (name === undefined) {
    return;
  }

  await vscode.window.withProgress(
    {
      title: 'Adding new app...',
      location: vscode.ProgressLocation.Notification
    },
    async () => {
      const context = getContext();
      const account = context.globalState.get<AccountInfo>('selectedAccount')!;
      const project = context.globalState.get<FirebaseProject | null>(
        'selectedProject'
      )!;

      try {
        const api = AppsAPI.for(account, project);
        await api.createApp(pick.options.type, project, {
          [pick.options.field]: name
        });

        const appsProvider = providerStore.get<AppsProvider>('apps');
        appsProvider.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(
          `Failed to add new app for project ${project.projectId}`
        );
      }
    }
  );
}

/**
 * Helper function to prompt for a new app's bundle ID or package name
 */
async function promptAppName(options: {
  type: string;
  prompt: string;
}): Promise<string | undefined> {
  const name = await vscode.window.showInputBox({
    placeHolder: 'com.company.appName',
    value: '',
    prompt: options.prompt,
    ignoreFocusOut: true
  });

  if (name === undefined) {
    return;
  }

  let isValid: boolean;
  let errorMsg: string;

  if (options.type === 'android') {
    const parts = name.split('.');
    isValid =
      parts.length >= 2 &&
      parts.every(part => /^[A-Za-z]([A-Za-z0-9_]*)$/.test(part));
    errorMsg =
      'The package name must: consist of letters, numbers or underscores; have at least two sections separated by periods; and each section must start with a letter.';
  } else if (options.type === 'ios') {
    isValid = /^[A-Za-z0-9\.\-]+$/.test(name);
    errorMsg =
      'The bundle ID must consist of letters, numbers, periods or hyphens.';
  } else {
    throw new Error('Unknow app type.');
  }

  if (isValid) {
    return name;
  } else {
    return promptAppName({ ...options, prompt: 'Error: ' + errorMsg });
  }
}

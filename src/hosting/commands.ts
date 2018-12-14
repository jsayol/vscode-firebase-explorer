import * as vscode from 'vscode';
// import * as request from 'request-promise-native';
import { HostingFileItem } from './HostingProvider';
// import { ProviderStore, TreeViewStore } from '../stores';
// import { AccountInfo } from '../accounts/AccountManager';
// import { FirebaseProject } from '../projects/ProjectManager';
// import { HostingAPI } from './api';
// import { readFile, getFilePath, downloadToTmpFile } from '../utils';

let context: vscode.ExtensionContext;

export function registerHostingCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.hosting.openFile',
      openFile
    )
  );
}

async function openFile(element: HostingFileItem): Promise<void> {
  if (!element) {
    return;
  }

  const release = element.release;
  const file = element.part.file!;
  console.log({ release, file });
  // try {
  //   await vscode.window.withProgress(
  //     {
  //       title: 'Getting file ' + file.path,
  //       location: vscode.ProgressLocation.Notification
  //     },
  //     async () => {
  //       console.log({ release, file });
  //       console.log(await AccountManager.forSelectedAccount().getAccessToken());
  //     }
  //   );
  // } catch (err) {
  //   console.log(err);
  // }
}

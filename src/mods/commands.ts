import * as vscode from 'vscode';
import { ModResourceItem, ModsProvider } from './ModsProvider';
import { isFunctionsResource } from './utils';
import { FunctionsAPI } from '../functions/api';
import { ModResourceFunction } from './api';
import { downloadToTmpFile, unzipToTmpDir } from '../utils';
import { providerStore, treeViewStore } from '../stores';

let context: vscode.ExtensionContext;

export function registerModsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.mods.functions.viewSource',
      viewSource
    )
  );
}

async function viewSource(element: ModResourceItem): Promise<void> {
  if (!element || !isFunctionsResource(element.resource)) {
    return;
  }

  const fnName = element.resource.properties.function;

  try {
    await vscode.window.withProgress(
      {
        title: 'Getting source from Cloud Storage for ' + fnName,
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        const api = FunctionsAPI.for(element.account, element.project);
        const downloadUrl = await api.getDownloadUrl(
          (element.resource as ModResourceFunction).url
        );
        const tmpZipFile = await downloadToTmpFile(downloadUrl);
        try {
          let tmpDir: any;
          try {
            tmpDir = await unzipToTmpDir(tmpZipFile.path);
          } catch (err) {
            console.log(err);
            throw err;
          }
          tmpZipFile.cleanup();
          element.setSourceDir(tmpDir.path);

          const provider = providerStore.get<ModsProvider>('mods');
          const treeView = treeViewStore.get('mods');

          provider.refresh(element);
          treeView.reveal(element, { expand: true });
        } catch (err) {
          tmpZipFile.cleanup();
          throw err;
        }
      }
    );
  } catch (err) {
    console.log({ err });
  }
}

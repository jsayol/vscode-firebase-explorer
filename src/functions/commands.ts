import * as request from 'request-promise-native';
import * as vscode from 'vscode';
import { ProviderStore, TreeViewStore } from '../stores';
import {
  downloadToTmpFile,
  getFilePath,
  readFile,
  unzipToTmpDir,
  contains
} from '../utils';
import { FunctionsAPI } from './api';
import { CloudFunctionItem, FunctionsProvider } from './FunctionsProvider';
import { getDetailsFromName } from './utils';

let context: vscode.ExtensionContext;
const logViews: {
  [k: string]: {
    panel: vscode.WebviewPanel;
    isLive: boolean;
    isReady: boolean;
  };
} = {};

export function registerFunctionsCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.refresh',
      refreshFunctions
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.trigger.GET',
      triggerFunction.bind(null, 'GET')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.trigger.POST',
      triggerFunction.bind(null, 'POST')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.openInConsole.cloud',
      openInCloudConsole
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.openInConsole.firebase',
      openInFirebaseConsole
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.viewLogs',
      viewLogs
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.functions.viewSource',
      viewSource
    )
  );
}

function refreshFunctions(): void {
  const functionsProvider = ProviderStore.get<FunctionsProvider>('functions');
  functionsProvider.refresh();
}

async function triggerFunction(method: string, element: CloudFunctionItem) {
  const fn = element.cloudFunction;
  const api = FunctionsAPI.for(element.account, element.project);

  // if (fn.httpsTrigger) {
  //   vscode.commands.executeCommand(
  //     'vscode.open',
  //     vscode.Uri.parse(fn.httpsTrigger.url)
  //   );
  // }

  const response: request.FullResponse = await api.trigger(method, fn);
  console.log({ response });
}

function openInCloudConsole(element: CloudFunctionItem): void {
  const details = getDetailsFromName(element.cloudFunction.name);
  vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.parse(
      `https://console.cloud.google.com/functions/details/${details.location}/${
        details.name
      }?project=${details.projectId}`
    )
  );
}

function openInFirebaseConsole(element: CloudFunctionItem): void {
  const details = getDetailsFromName(element.cloudFunction.name);
  vscode.commands.executeCommand(
    'vscode.open',
    vscode.Uri.parse(
      `https://console.firebase.google.com/project/${
        details.projectId
      }/functions/logs?functionFilter=${details.name}`
    )
  );
}

async function viewLogs(element: CloudFunctionItem): Promise<void> {
  const panelId =
    element.account.user.email + '--' + element.cloudFunction.name;

  try {
    if (contains(logViews, panelId)) {
      const { panel, isLive, isReady } = logViews[panelId];
      if (isReady && !isLive) {
        setImmediate(() => {
          panel.webview.postMessage({
            command: 'fetchNew'
          });
        });
      }
      panel.reveal();
    } else {
      const fnName = element.cloudFunction.entryPoint;
      await vscode.window.withProgress(
        {
          title: 'Getting Cloud Functions log for ' + fnName,
          location: vscode.ProgressLocation.Notification
        },
        async () => {
          const api = FunctionsAPI.for(element.account, element.project);
          let logEntries = await api.getLog(element.cloudFunction);

          const panel = vscode.window.createWebviewPanel(
            'function.logTail',
            'Log: ' + fnName,
            vscode.ViewColumn.One,
            {
              enableScripts: true,
              retainContextWhenHidden: true
            }
          );

          panel.webview.html = await readFile(
            getFilePath('ui/functions/log.html'),
            'utf8'
          );

          panel.webview.onDidReceiveMessage(async data => {
            switch (data.command) {
              case 'ready':
                logViews[panelId] = {
                  ...logViews[panelId],
                  isReady: true
                };
                panel.webview.postMessage({
                  command: 'initialize',
                  name: fnName,
                  isLive: false,
                  entries: logEntries
                });
                // logEntries = undefined as any;
                break;
              case 'isLive':
                logViews[panelId] = {
                  ...logViews[panelId],
                  isLive: data.isLive
                };
                break;
              case 'getEntries':
                const entries = await api.getLog(element.cloudFunction, {
                  since: data.since
                });
                panel.webview.postMessage({
                  command: 'addEntries',
                  entries
                });
                break;
            }
          });

          // panel.onDidChangeViewState(
          //   _event => {
          //     const panel = _event.webviewPanel;
          //   },
          //   null,
          //   context.subscriptions
          // );

          panel.onDidDispose(
            () => {
              // Do any cleanup here
              delete logViews[panelId];
            },
            null,
            context.subscriptions
          );

          logViews[panelId] = { panel, isLive: false, isReady: false };
        }
      );
    }
  } catch (err) {
    console.log({ err });
  }
}

async function viewSource(element: CloudFunctionItem): Promise<void> {
  const fnName = element.cloudFunction.entryPoint;

  try {
    await vscode.window.withProgress(
      {
        title: 'Getting source from Cloud Storage for ' + fnName,
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        const api = FunctionsAPI.for(element.account, element.project);
        const downloadUrl = await api.getDownloadUrl(element.cloudFunction);
        const tmpZipFile = await downloadToTmpFile(downloadUrl);
        try {
          const tmpDir = await unzipToTmpDir(tmpZipFile.path);
          tmpZipFile.cleanup();
          element.setSourceDir(tmpDir.path);

          const provider = ProviderStore.get<FunctionsProvider>('functions');
          const treeView = TreeViewStore.get('functions');

          provider.refresh(element);
          treeView.reveal(element, { expand: true });
        } catch (err) {
          console.log('Catch1', err);
          tmpZipFile.cleanup();
          throw err;
        }
      }
    );
  } catch (err) {
    console.log({ err });
  }
}

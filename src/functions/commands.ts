import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { FunctionsProvider, CloudFunctionItem } from './FunctionsProvider';
import { ProviderStore } from '../ProviderStore';
import { AccountInfo } from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { CloudFunction, FunctionsAPI } from './api';
import { getDetailsFromName } from './utils';
import { readFile, getFilePath } from '../utils';

let context: vscode.ExtensionContext;

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
      'firebaseExplorer.functions.selection',
      selectFunction
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
      'firebaseExplorer.functions.logTail',
      logTail
    )
  );
}

function refreshFunctions(): void {
  const functionsProvider = ProviderStore.get<FunctionsProvider>('functions');
  functionsProvider.refresh();
}

function selectFunction(
  _account: AccountInfo,
  _project: FirebaseProject,
  cloudFunction: CloudFunction
): void {
  console.log(cloudFunction);
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
      }/functions/logs?search=true&functionFilter=${details.name}`
    )
  );
}

async function logTail(element: CloudFunctionItem): Promise<void> {
  const fnName = element.cloudFunction.entryPoint;

  try {
    await vscode.window.withProgress(
      {
        title: 'Getting Cloud Functions log for ' + fnName,
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        const api = FunctionsAPI.for(element.account, element.project);
        const logEntries = await api.getLog(element.cloudFunction);

        const html = await readFile(
          getFilePath('ui/functions/log.html'),
          'utf8'
        );

        const panel = vscode.window.createWebviewPanel(
          'function.logTail',
          'Log: ' + fnName,
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        let liveState = false;

        panel.webview.html = html;

        panel.webview.onDidReceiveMessage(async data => {
          switch (data.command) {
            case 'liveState':
              liveState = data.liveState;
              break;
            case 'getEntries':
              const since = data.since;
              const entries = await api.getLog(element.cloudFunction, {
                since
              });
              panel.webview.postMessage({
                command: 'addEntries',
                entries
              });
              break;
          }
        });

        panel.onDidChangeViewState(
          _event => {
            // const panel = _event.webviewPanel;
          },
          null,
          context.subscriptions
        );

        panel.onDidDispose(
          () => {
            // Do any cleanup here
          },
          null,
          context.subscriptions
        );

        panel.webview.postMessage({
          command: 'initialize',
          name: fnName,
          liveState
        });

        panel.webview.postMessage({
          command: 'addEntries',
          entries: logEntries
        });
      }
    );
  } catch (err) {
    console.log({ err });
  }
}

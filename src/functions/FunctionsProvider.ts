import * as path from 'path';
import * as vscode from 'vscode';
import { FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem } from '../utils';
import { AccountInfo } from '../accounts/AccountManager';
import { FunctionsAPI, CloudFunction, CloudFunctionTriggerType } from './api';

const ASSETS_PATH = './assets';

export class FunctionsProvider
  implements vscode.TreeDataProvider<FunctionsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FunctionsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: FunctionsProviderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: FunctionsProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: FunctionsProviderItem
  ): Promise<FunctionsProviderItem[]> {
    const account = this.context.globalState.get<AccountInfo>(
      'selectedAccount'
    );
    const project = this.context.globalState.get<FirebaseProject>(
      'selectedProject'
    );

    if (project === null) {
      return [messageTreeItem('Loading...')];
    }

    if (!account || !project) {
      // No selected account or project
      return [];
    }

    if (!element) {
      const functionsApi = FunctionsAPI.for(account, project);
      let functions: CloudFunction[] | null;

      try {
        functions = await functionsApi.list();
      } catch (err) {
        return [
          messageTreeItem(
            'Failed to retrieve functions',
            'Something went wrong while retrieving the list of Cloud Functions for this project.',
            'alert'
          )
        ];
      }

      if (functions === null) {
        // TODO: Should offer a way to enable it
        return [
          messageTreeItem(
            'Not enabled for this project',
            'The Cloud Functions API is not enabled for this project. Refresh to fetch any updates once you have enabled it.'
          )
        ];
      }

      if (functions.length === 0) {
        return [
          messageTreeItem(
            'No functions for this project',
            'There are no deployed functions for this project. Refresh to fetch any updates.'
          )
        ];
      }

      const eventFunctions: CloudFunction[] = [];
      const httpsFunctions: CloudFunction[] = [];
      const otherFunctions: CloudFunction[] = [];

      functions.forEach(fn => {
        if (fn.eventTrigger) {
          eventFunctions.push(fn);
        } else if (fn.httpsTrigger) {
          httpsFunctions.push(fn);
        } else {
          otherFunctions.push(fn);
          console.log('Unknown Cloud Function type.', fn);
        }
      });

      const items: FunctionsProviderItem[] = [];

      if (eventFunctions.length > 0) {
        items.push(
          new FunctionTriggerTypeItem(
            account,
            project,
            CloudFunctionTriggerType.Event,
            eventFunctions
          )
        );
      }

      if (httpsFunctions.length > 0) {
        items.push(
          new FunctionTriggerTypeItem(
            account,
            project,
            CloudFunctionTriggerType.HTTPS,
            httpsFunctions
          )
        );
      }

      if (otherFunctions.length > 0) {
        items.push(
          new FunctionTriggerTypeItem(
            account,
            project,
            CloudFunctionTriggerType.Other,
            otherFunctions
          )
        );
      }

      return items;
    } else if (element instanceof FunctionTriggerTypeItem) {
      return element.functions.map(
        fn => new CloudFunctionItem(account, project, element.type, fn)
      );
    } else if (element instanceof CloudFunctionItem) {
      // TODO?
      return [];
    } else {
      return [];
    }
  }
}

export class FunctionTriggerTypeItem extends vscode.TreeItem {
  constructor(
    public account: AccountInfo,
    public project: FirebaseProject,
    public type: CloudFunctionTriggerType,
    public functions: CloudFunction[]
  ) {
    super('', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `functions.triggerType.${type}`;
    this.iconPath = {
      light: path.resolve(ASSETS_PATH, `functions/light/${type}-trigger.svg`),
      dark: path.resolve(ASSETS_PATH, `functions/dark/${type}-trigger.svg`)
    };

    switch (type) {
      case CloudFunctionTriggerType.Event:
        this.label = 'Event Trigger';
        break;
      case CloudFunctionTriggerType.HTTPS:
        this.label = 'HTTPS Trigger';
        break;
      case CloudFunctionTriggerType.Other:
      default:
        this.label = 'Other Trigger';
    }

    this.functions = this.functions.sort((fnA, fnB) =>
      fnA.entryPoint > fnB.entryPoint ? 1 : -1
    );
  }

  get tooltip(): string {
    return 'Trigger: Event';
  }
}

export class CloudFunctionItem extends vscode.TreeItem {
  readonly command: vscode.Command = {
    command: 'firebaseExplorer.functions.selection',
    title: '',
    arguments: [this.account, this.project, this.cloudFunction]
  };

  constructor(
    public account: AccountInfo,
    public project: FirebaseProject,
    public type: CloudFunctionTriggerType,
    public cloudFunction: CloudFunction
  ) {
    super(cloudFunction.entryPoint, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `functions.ofTriggerType.${type}`;
    this.iconPath = path.resolve(ASSETS_PATH, `functions/${type}-trigger.svg`);
  }

  get tooltip(): string {
    return this.label!;
  }
}

export type FunctionsProviderItem = FunctionTriggerTypeItem | CloudFunctionItem;

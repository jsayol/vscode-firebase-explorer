import * as vscode from 'vscode';
import * as directoryTree from 'directory-tree';
import { FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem, caseInsensitiveCompare, getFilePath } from '../utils';
import { AccountInfo } from '../accounts/AccountManager';
import { FunctionsAPI, CloudFunction, CloudFunctionTriggerType } from './api';

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

  getParent(element: FunctionsProviderItem): FunctionsProviderItem | undefined {
    if (element instanceof FunctionTriggerTypeItem) {
      return undefined;
    } else {
      return element.parent;
    }
  }

  async getChildren(
    element?: FunctionsProviderItem
  ): Promise<FunctionsProviderItem[]> {
    const account = this.context.globalState.get<AccountInfo>(
      'selectedAccount'
    );
    const project = this.context.globalState.get<FirebaseProject | null>(
      'selectedProject'
    );

    if (project === null) {
      return [messageTreeItem('Loading...')];
    }

    if (!account || !project) {
      // No selected account or project
      return [];
    }

    const functionsApi = FunctionsAPI.for(account, project);

    if (!element) {
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
          console.log('Unknown Cloud Function type!', fn);
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
        fn => new CloudFunctionItem(account, project, element.type, fn, element)
      );
    } else if (element instanceof CloudFunctionItem) {
      if (!element.sourceCodeDir) {
        return [];
      }

      const dirTree = directoryTree(element.sourceCodeDir);
      if (dirTree.type !== 'directory') {
        throw new Error('Source code directory is not a directory!');
      }
      return dirTree.children!.map(
        child => new CloudFunctionSourceItem(child, element)
      );
    } else if (element instanceof CloudFunctionSourceItem) {
      return element.tree.children!.map(
        child => new CloudFunctionSourceItem(child, element)
      );
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
    // this.iconPath = {
    //   light: getFilePath('assets', 'functions', 'light', `${type}-trigger.svg`),
    //   dark: getFilePath('assets', 'functions', 'dark', `${type}-trigger.svg`)
    // };
    this.iconPath = getFilePath('assets', 'functions', `${type}-trigger.svg`);

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
      caseInsensitiveCompare(fnA.displayName, fnB.displayName)
    );
  }

  get tooltip(): string {
    return this.label!;
  }
}

export class CloudFunctionItem extends vscode.TreeItem {
  sourceCodeDir?: string;
  iconPath = {
    dark: getFilePath('assets', 'functions', 'dark', 'cloud-functions.svg'),
    light: getFilePath('assets', 'functions', 'light', 'cloud-functions.svg')
  };

  constructor(
    public account: AccountInfo,
    public project: FirebaseProject,
    public type: CloudFunctionTriggerType,
    public cloudFunction: CloudFunction,
    public parent: FunctionsProviderItem
  ) {
    super(cloudFunction.displayName, vscode.TreeItemCollapsibleState.None);
    this.contextValue = `functions.ofTriggerType.${type}`;
    // this.iconPath = getFilePath('assets', 'functions', `${type}-trigger.svg`);
  }

  get tooltip(): string {
    return this.label!;
  }

  setSourceDir(dirPath: string) {
    this.sourceCodeDir = dirPath;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}

export class CloudFunctionSourceItem extends vscode.TreeItem {
  constructor(
    public tree: ReturnType<typeof directoryTree>,
    public parent: FunctionsProviderItem
  ) {
    super(tree.name);

    this.resourceUri = vscode.Uri.parse(
      'firebase-explorer-readonly:' + tree.path
    );

    if (tree.type === 'directory') {
      this.iconPath = vscode.ThemeIcon.Folder;
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      this.iconPath = vscode.ThemeIcon.File;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.command = {
        command: 'vscode.open',
        title: '',
        arguments: [this.resourceUri]
      };
    }
  }
}

export type FunctionsProviderItem =
  | FunctionTriggerTypeItem
  | CloudFunctionItem
  | CloudFunctionSourceItem;

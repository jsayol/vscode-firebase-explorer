import * as path from 'path';
import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import {
  ProjectManager,
  FirebaseProject,
  AndroidApp,
  IosApp
} from '../projects/ProjectManager';
import { messageTreeItem } from '../utils';

export class AppsProvider implements vscode.TreeDataProvider<AppsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    AppsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: AppsProviderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: AppsProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: AppsProviderItem): Promise<AppsProviderItem[]> {
    if (element) {
      // For now we don't show any children for an app entry
      return [];
    }

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

    const projectManager = ProjectManager.for(account, project);
    const apps = await projectManager.listApps(true);
    let items: AppsProviderItem[] = [];

    if (apps.ios.length === 0 && apps.android.length === 0) {
      // No apps for project
      return [
        messageTreeItem(
          'No apps for this project',
          'There are no apps created for this project. Refresh to fetch any updates.'
        )
      ];
    }

    apps.ios.forEach(app => items.push(new IosAppItem(app, account, project)));

    apps.android.forEach(app =>
      items.push(new AndroidAppItem(app, account, project))
    );

    return items;
  }
}

export class IosAppItem extends vscode.TreeItem {
  contextValue = 'apps.iosApp';
  iconPath = path.join(__filename, '..', '..', '..', 'assets', 'apps/ios.svg');

  constructor(
    public app: IosApp,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(
      app.metadata.displayName || app.metadata.bundleId,
      vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return (
      `• Bundle: ${this.app.metadata.bundleId}\n` +
      `• ID: ${this.app.metadata.appId}`
    );
  }
}

export class AndroidAppItem extends vscode.TreeItem {
  contextValue = 'apps.androidApp';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'apps/android-head.svg'
  );

  constructor(
    public app: AndroidApp,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(
      app.metadata.displayName || app.metadata.packageName,
      vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return (
      `• Package: ${this.app.metadata.packageName}\n` +
      `• ID: ${this.app.metadata.appId}`
    );
  }
}

export type AppsProviderItem = IosAppItem | AndroidAppItem;

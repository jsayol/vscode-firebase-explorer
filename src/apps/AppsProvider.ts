import * as path from 'path';
import * as vscode from 'vscode';
import * as firebaseAdmin from 'firebase-admin';
import { AccountInfo } from '../accounts/interfaces';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';

export class AppsProvider implements vscode.TreeDataProvider<AppsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    AppsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
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

    if (!account || !project) {
      // No selected account or project
      return [];
    }

    const projectManager = ProjectManager.for(account, project);
    const apps = await projectManager.listApps();
    let items: AppsProviderItem[] = [];

    apps.ios.forEach(app =>
      items.push(new IosAppItem(app.metadata, account, project))
    );

    apps.android.forEach(app =>
      items.push(new AndroidAppItem(app.metadata, account, project))
    );

    return items;
  }
}

export class IosAppItem extends vscode.TreeItem {
  contextValue = 'iosApp';
  iconPath = path.join(__filename, '..', '..', '..', 'assets', 'app-ios.svg');

  constructor(
    public metadata: firebaseAdmin.projectManagement.IosAppMetadata,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(
      metadata.displayName || metadata.bundleId,
      vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return (
      `• Bundle: ${this.metadata.bundleId}\n` + `• ID: ${this.metadata.appId}`
    );
  }
}

export class AndroidAppItem extends vscode.TreeItem {
  contextValue = 'androidApp';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'app-android.svg'
  );

  constructor(
    public metadata: firebaseAdmin.projectManagement.AndroidAppMetadata,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(
      metadata.displayName || metadata.packageName,
      vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return (
      `• Package: ${this.metadata.packageName}\n` +
      `• ID: ${this.metadata.appId}`
    );
  }
}

export type AppsProviderItem = IosAppItem | AndroidAppItem;

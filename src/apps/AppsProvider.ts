import * as path from 'path';
import * as vscode from 'vscode';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem } from '../utils';
import { IosApp, AndroidApp, ShaCertificate } from './apps';
import { AccountInfo } from '../accounts/AccountManager';

const ASSETS_PATH = './assets';

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

    if (!element) {
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

      apps.ios.forEach(app =>
        items.push(new IosAppItem(app, account, project))
      );

      apps.android.forEach(app =>
        items.push(new AndroidAppItem(app, account, project))
      );

      return items;
    } else if (element instanceof AndroidAppItem) {
      return [new FingerprintFolderItem(element.app, element)];
    } else if (element instanceof FingerprintFolderItem) {
      const certificates = await element.app.getShaCertificates();
      return certificates.map(
        cert => new FingerprintItem(element.app, cert, element)
      );
    } else {
      // No children for anything else (including an IosAppItem)
      return [];
    }
  }
}

export class IosAppItem extends vscode.TreeItem {
  contextValue = 'apps.iosApp';
  iconPath = path.resolve(ASSETS_PATH, 'apps/ios.svg');

  constructor(
    public app: IosApp,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(app.appName, vscode.TreeItemCollapsibleState.None);
  }

  get tooltip(): string {
    return `• Bundle: ${this.app.bundleId}\n` + `• ID: ${this.app.appId}`;
  }
}

export class AndroidAppItem extends vscode.TreeItem {
  contextValue = 'apps.androidApp';
  iconPath = path.resolve(ASSETS_PATH, 'apps/android-head.svg');

  constructor(
    public app: AndroidApp,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(app.appName, vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return `• Package: ${this.app.packageName}\n` + `• ID: ${this.app.appId}`;
  }
}

export class FingerprintFolderItem extends vscode.TreeItem {
  contextValue = 'apps.androidApp.fingerprintsFolder';
  iconPath = {
    light: path.resolve(ASSETS_PATH, 'apps/light/fingerprint.svg'),
    dark: path.resolve(ASSETS_PATH, 'apps/dark/fingerprint.svg')
  };

  constructor(public app: AndroidApp, public appItem: AndroidAppItem) {
    super('Fingerprints', vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return 'The SHA certificate fingerprints for this app';
  }
}

export class FingerprintItem extends vscode.TreeItem {
  contextValue = 'apps.androidApp.fingerprint';
  iconPath = {
    light: path.resolve(ASSETS_PATH, 'apps/light/certificate.svg'),
    dark: path.resolve(ASSETS_PATH, 'apps/dark/certificate.svg')
  };

  constructor(
    public app: AndroidApp,
    public cert: ShaCertificate,
    public folderItem: FingerprintFolderItem
  ) {
    super(
      cert.shaHash.match(/../g)!.join(':'),
      vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return `[${this.cert.certType.replace('_', '-')}] ${this.label}`;
  }
}

export type AppsProviderItem =
  | IosAppItem
  | AndroidAppItem
  | FingerprintFolderItem
  | FingerprintItem;

import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem, dateToString, contains, getFilePath } from '../utils';
import {
  HostingAPI,
  HostingRelease,
  HostingSite,
  HostingReleaseType,
  HostingVersionStatus
} from './api';
import { filesToTree, PathTreePart, sortTreeParts } from './utils';

export class HostingProvider
  implements vscode.TreeDataProvider<HostingProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    HostingProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: HostingProviderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: HostingProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: HostingProviderItem
  ): Promise<HostingProviderItem[]> {
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

    const api = HostingAPI.for(account, project);

    if (!element) {
      let sites: HostingSite[];

      try {
        sites = await api.listSites();
      } catch (err) {
        return [
          messageTreeItem(
            'Failed to retrieve Hosting sites',
            `
              Something went wrong while retrieving the list of
              Firebase Hosting sites for this project.
            `,
            'alert'
          )
        ];
      }

      if (sites.length === 0) {
        return [
          messageTreeItem(
            'No Firebase Hosting sites for this project',
            `
              There are no deployed functions for this project.
              Refresh to fetch any updates.
            `
          )
        ];
      } else if (sites.length === 1) {
        return releasesForSite(account, project, api, sites[0]);
      } else {
        return sites.map(site => new HostingSiteItem(account, project, site));
      }
    } else if (element instanceof HostingSiteItem) {
      return releasesForSite(account, project, api, element.site);
    } else if (element instanceof HostingReleaseItem) {
      const release = element.release;
      const items: HostingProviderItem[] = [
        new HostingReleaseInfoItem(release, 'releaseUser'),
        new HostingReleaseInfoItem(release, 'releaseTime')
      ];

      if (release.version) {
        items.push(new HostingReleaseInfoItem(release, 'createTime'));
      }

      items.push(
        new HostingReleaseInfoItem(release, 'status', element.activeVersion)
      );

      if (release.version) {
        items.push(
          new HostingFolderItem(release, { name: 'Files (list only)' })
        );
      }

      return items;
    } else if (element instanceof HostingFolderItem) {
      if (contains(element.part, 'children')) {
        return sortTreeParts(element.part.children!).map(part =>
          treePartToItem(part, account, project, element.release)
        );
      } else {
        // Root folder for the files, we need to load them
        const files = await api.listFiles(element.release.version.name);
        const parts = sortTreeParts(filesToTree(files));
        element.part.children = parts;
        return parts.map(part =>
          treePartToItem(part, account, project, element.release)
        );
      }
    } else {
      return [];
    }
  }
}

export class HostingSiteItem extends vscode.TreeItem {
  contextValue = 'hosting.site';
  iconPath = {
    dark: getFilePath('assets', 'hosting', 'dark', 'site.svg'),
    light: getFilePath('assets', 'hosting', 'light', 'site.svg')
  };

  constructor(
    public accountInfo: AccountInfo,
    public project: FirebaseProject,
    public site: HostingSite
  ) {
    super(site.site, vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return this.label!;
  }
}

export class HostingReleaseItem extends vscode.TreeItem {
  contextValue = 'hosting.release';

  constructor(
    public accountInfo: AccountInfo,
    public project: FirebaseProject,
    public release: HostingRelease,
    public activeVersion: string
  ) {
    super('', vscode.TreeItemCollapsibleState.Collapsed);

    this.label = new Date(release.releaseTime).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    if (release.type === HostingReleaseType.ROLLBACK) {
      this.iconPath = {
        dark: getFilePath('assets', 'hosting', 'dark', 'rolledback.svg'),
        light: getFilePath('assets', 'hosting', 'light', 'rolledback.svg')
      };
    } else if (
      release.type === HostingReleaseType.SITE_DISABLE ||
      !release.version
    ) {
      // this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = {
        dark: getFilePath('assets', 'dark', 'cancel.svg'),
        light: getFilePath('assets', 'light', 'cancel.svg')
      };
    } else if (
      release.version.status === HostingVersionStatus.DELETED ||
      release.version.status === HostingVersionStatus.EXPIRED
    ) {
      // this.label = `<i>${this.label}</i>`;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = {
        dark: getFilePath('assets', 'hosting', 'dark', 'deleted.svg'),
        light: getFilePath('assets', 'hosting', 'light', 'deleted.svg')
      };
    } else if (release.version.name === activeVersion) {
      this.iconPath = getFilePath('assets', 'hosting', 'release-active.svg');
    } else {
      this.iconPath = {
        dark: getFilePath('assets', 'hosting', 'dark', 'deployed.svg'),
        light: getFilePath('assets', 'hosting', 'light', 'deployed.svg')
      };
    }
  }

  get tooltip(): string {
    return this.release.releaseTime;
  }
}

export class HostingReleaseInfoItem extends vscode.TreeItem {
  collapsibleState = vscode.TreeItemCollapsibleState.None;

  constructor(
    public release: HostingRelease,
    public info: string,
    activeVersion?: string
  ) {
    super('');
    this.contextValue = `hosting.release.info.${info}`;

    let icon: string | undefined;

    if (info === 'createTime') {
      const date = dateToString(release.version.createTime);
      this.label = `Created: ${date}`;
      icon = 'calendar-clock';
    } else if (info === 'releaseTime') {
      const date = dateToString(release.releaseTime);
      this.label = `Released: ${date}`;
      icon = 'calendar-clock';
    } else if (info === 'releaseUser') {
      const imageUrl = release.releaseUser.imageUrl;
      if (typeof imageUrl === 'string' && imageUrl.length > 0) {
        this.iconPath = vscode.Uri.parse(imageUrl);
      } else {
        icon = 'account';
      }
      this.label = `User: ${release.releaseUser.email}`;
    } else if (info === 'status') {
      let status: string;

      if (release.type === HostingReleaseType.ROLLBACK) {
        status = 'Rolled back';
      } else if (release.type === HostingReleaseType.SITE_DISABLE) {
        status = 'Site disabled';
      } else if (release.type === HostingReleaseType.DEPLOY) {
        if (release.version.name === activeVersion) {
          status = 'Current';
        } else {
          status = 'Deployed';
        }
      } else {
        status = 'Unknown';
      }

      this.label = `Status: ${status}`;
      icon = 'cloud-outline';
    }

    if (icon !== undefined) {
      this.iconPath = {
        dark: getFilePath('assets', 'dark', `${icon}.svg`),
        light: getFilePath('assets', 'light', `${icon}.svg`)
      };
    }
  }
}

export class HostingFolderItem extends vscode.TreeItem {
  contextValue = `hosting.release.folder`;
  iconPath = vscode.ThemeIcon.Folder;
  collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  tooltip = undefined;

  constructor(
    public release: HostingRelease,
    public part: Partial<PathTreePart>
  ) {
    super(part.name!);
    this.resourceUri = vscode.Uri.file(part.name!);
  }
}

export class HostingFileItem extends vscode.TreeItem {
  contextValue = `hosting.release.file`;
  iconPath = vscode.ThemeIcon.File;
  collapsibleState = vscode.TreeItemCollapsibleState.None;
  tooltip = undefined;
  // command = {
  //   command: 'firebaseExplorer.hosting.openFile',
  //   title: 'Open this file',
  //   arguments: [this]
  // };

  constructor(
    public accountInfo: AccountInfo,
    public project: FirebaseProject,
    public release: HostingRelease,
    public part: PathTreePart
  ) {
    super(part.name);
    this.resourceUri = vscode.Uri.file(part.name);
  }
}

export type HostingProviderItem =
  | HostingSiteItem
  | HostingReleaseItem
  | HostingReleaseInfoItem
  | HostingFolderItem
  | HostingFileItem;

function treePartToItem(
  part: PathTreePart,
  accountInfo: AccountInfo,
  project: FirebaseProject,
  release: HostingRelease
): HostingFolderItem | HostingFileItem {
  {
    if (part.file) {
      return new HostingFileItem(accountInfo, project, release, part);
    } else {
      return new HostingFolderItem(release, part);
    }
  }
}

async function releasesForSite(
  accountInfo: AccountInfo,
  project: FirebaseProject,
  api: HostingAPI,
  site: HostingSite
): Promise<HostingReleaseItem[]> {
  const releases = await api.listReleases(site.site);
  if (releases.length === 0) {
    return [
      messageTreeItem(
        'No releases for this site',
        'There are no deployed releases for this Firebase Hosting site. Refresh to fetch any updates.'
      ) as HostingReleaseItem
    ];
  } else {
    if (releases.length > 0) {
      const activeVersion = releases[0].version ? releases[0].version.name : '';
      return releases.map(release => {
        return new HostingReleaseItem(
          accountInfo,
          project,
          release,
          activeVersion
        );
      });
    } else {
      return [];
    }
  }
}

import * as path from 'path';
import * as vscode from 'vscode';
import { FirebaseProject } from './ProjectManager';
import { AccountManager, AccountInfo } from '../accounts/AccountManager';
import { messageTreeItem } from '../utils';

const ASSETS_PATH = './assets';

export class ProjectsProvider
  implements vscode.TreeDataProvider<AccountsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    AccountsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // constructor(/*private context: vscode.ExtensionContext*/) {}

  refresh(element?: AccountItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: AccountsProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: AccountsProviderItem
  ): Promise<AccountsProviderItem[]> {
    if (!element) {
      // List the available accounts
      const accounts = AccountManager.getAccounts();
      return accounts.map(acc => new AccountItem(acc));
    } else if (element instanceof AccountItem) {
      // List the projects for this account
      const accountManager = AccountManager.for(element.account);
      const projects = await accountManager.listProjects();

      if (Array.isArray(projects) && projects.length > 0) {
        return projects.map(
          project => new ProjectItem(element.account, project)
        );
      } else {
        return [
          messageTreeItem(
            'No Firebase projects found',
            "Couldn't find any Firebase projects for this account. Create one to proceed."
          )
        ];
      }
    } else if (element instanceof ProjectItem) {
      // No children to show for a project
      return [];
    } else {
      // error?
      console.error('Should not happen!', element);
      return [];
    }
  }
}

export class AccountItem extends vscode.TreeItem {
  contextValue = 'account';
  iconPath = path.resolve(ASSETS_PATH, 'account-google.svg');

  constructor(
    public account: AccountInfo,
    public readonly command?: vscode.Command
  ) {
    super(account.user.email, vscode.TreeItemCollapsibleState.Expanded);
  }

  get tooltip(): string {
    return this.label!;
  }
}

export class ProjectItem extends vscode.TreeItem {
  contextValue = 'project';
  iconPath = path.resolve(ASSETS_PATH, 'firebase.svg');

  readonly command: vscode.Command = {
    command: 'firebaseExplorer.projects.selection',
    title: '',
    arguments: [this.account, this.project]
  };

  constructor(private account: AccountInfo, private project: FirebaseProject) {
    super(project.displayName, vscode.TreeItemCollapsibleState.None);
  }

  get tooltip(): string {
    return this.project.projectId;
  }
}

export type AccountsProviderItem = AccountItem | ProjectItem;

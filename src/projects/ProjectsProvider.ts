import * as path from 'path';
import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject } from './ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import { messageTreeItem } from '../utils';

export class ProjectsProvider
  implements vscode.TreeDataProvider<AccountsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    AccountsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AccountsProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: AccountsProviderItem
  ): Promise<AccountsProviderItem[]> {
    if (!element) {
      const accounts = this.context.globalState.get<AccountInfo[]>('accounts');

      if (!Array.isArray(accounts)) {
        // There's no logged-in accounts
        return [];
      }

      return accounts.map(acc => new AccountItem(acc));
    } else if (element instanceof AccountItem) {
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
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'account-google.svg'
  );

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
  iconPath = path.join(__filename, '..', '..', '..', 'assets', 'firebase.svg');

  readonly command: vscode.Command = {
    command: 'firebaseExplorer.projects.selection',
    title: '',
    arguments: [this.account, this.project]
  };

  constructor(private account: AccountInfo, private project: FirebaseProject) {
    super(project.name, vscode.TreeItemCollapsibleState.None);
  }

  get tooltip(): string {
    return this.project.id;
  }
}

export type AccountsProviderItem = AccountItem | ProjectItem;

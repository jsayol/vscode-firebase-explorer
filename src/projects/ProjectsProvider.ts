import * as vscode from 'vscode';
import { FirebaseProject } from './ProjectManager';
import { AccountManager, AccountInfo } from '../accounts/AccountManager';
import { messageTreeItem, getFilePath } from '../utils';

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
      return accounts.map(account => new AccountItem(account.info));
    } else if (element instanceof AccountItem) {
      // List the projects for this account
      const accountManager = AccountManager.for(element.accountInfo);

      let projects = accountManager.listProjectsSync()!;
      const asyncProjects = accountManager.listProjects({ refresh: true });

      if (!projects || projects.length === 0) {
        projects = await asyncProjects;
      } else {
        // Since we got the list of projects from the local cache, trigger
        // an update just in case there's been changes to the projects list.
        asyncProjects
          .then(newProjects => {
            const ids = projects.map(p => p.projectId).sort();
            const newIds = newProjects.map(p => p.projectId).sort();
            const anyDifference =
              projects.length !== newProjects.length ||
              ids.some((id, index) => id !== newIds[index]);

            if (anyDifference) {
              // Reload the tree view
              this.refresh(element);
            }
          })
          .catch(err => {
            console.error(err);
          });
      }

      if (Array.isArray(projects) && projects.length > 0) {
        return projects.map(
          project => new ProjectItem(element.accountInfo, project)
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
  iconPath = getFilePath('assets', 'account-google.svg');

  constructor(
    public accountInfo: AccountInfo,
    public readonly command?: vscode.Command
  ) {
    super(accountInfo.user.email, vscode.TreeItemCollapsibleState.Expanded);
  }

  get tooltip(): string {
    return this.label!;
  }
}

export class ProjectItem extends vscode.TreeItem {
  contextValue = 'project';
  iconPath = getFilePath('assets', 'firebase-color-small.svg');

  readonly command: vscode.Command = {
    command: 'firebaseExplorer.projects.selection',
    title: '',
    arguments: [this.accountInfo, this.project]
  };

  constructor(
    private accountInfo: AccountInfo,
    private project: FirebaseProject
  ) {
    super(project.displayName, vscode.TreeItemCollapsibleState.None);
  }

  get tooltip(): string {
    return this.project.projectId;
  }
}

export type AccountsProviderItem = AccountItem | ProjectItem;

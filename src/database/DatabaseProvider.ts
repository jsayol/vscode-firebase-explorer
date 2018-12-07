import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject } from '../projects/ProjectManager';
import { DatabaseAPI, DatabaseShallowValue } from './api';

export class DatabaseProvider
  implements vscode.TreeDataProvider<DatabaseProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    DatabaseProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DatabaseProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: DatabaseProviderItem
  ): Promise<DatabaseProviderItem[]> {
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

    const api = DatabaseAPI.for(account, project);
    const path = element ? getFullPath(element.parentPath, element.name) : '';
    const value = await api.getShallow(path);

    if (
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string' ||
      value === null ||
      value === void 0 ||
      Array.isArray(value)
    ) {
      // It's a value
      if (!element) {
        if (value !== null) {
          console.log(
            'The root of the database is not supposed to have values, only fields!'
          );
        }
      } else {
        element.value = value;
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
      }
      return [];
    } else {
      // It's a nested object
      return Object.keys(value).map(key => new DatabaseProviderItem(key, path));
    }
  }
}

export class DatabaseProviderItem extends vscode.TreeItem {
  contextValue = 'databaseEntry';
  private _value: DatabaseShallowValue | undefined;

  constructor(public name: string, public parentPath: string) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    const valuePath = getFullPath(this.parentPath, this.name);
    let tooltip: string;

    if (this._value === void 0) {
      tooltip = valuePath;
    } else {
      tooltip = `• Path: ${valuePath}\n• Value: ${JSON.stringify(this._value)}`;
    }
    return tooltip;
  }

  set value(value: DatabaseShallowValue) {
    this._value = value;
    this.contextValue = 'databaseValueEntry';
    this.label = `${this.name}: ${JSON.stringify(this._value)}`;
    this.collapsibleState = vscode.TreeItemCollapsibleState.None;
  }
}

function getFullPath(parentPath: string, name: string) {
  return [parentPath, name].filter(Boolean).join('/');
}

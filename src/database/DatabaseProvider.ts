import * as path from 'path';
import * as vscode from 'vscode';
import { FirebaseProject } from '../projects/ProjectManager';
import { DatabaseAPI, DatabaseShallowValue } from './api';
import { caseInsensitiveCompare, messageTreeItem, getFullPath, extContext } from '../utils';
import { AccountInfo } from '../accounts/AccountManager';

export class DatabaseProvider
  implements vscode.TreeDataProvider<DatabaseProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    DatabaseProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: DatabaseProviderItem): void {
    this._onDidChangeTreeData.fire(element);
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

    const api = DatabaseAPI.for(account, project);
    const path = element ? getFullPath(element.parentPath, element.name) : '';
    const value = await api.getShallow(path);

    if (!element && value === null) {
      // Nothing in the database
      return [
        messageTreeItem(
          'Database is empty for this project',
          'There is no data in the database. Refresh to fetch any updates.'
        )
      ];
    }

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
      if (element && !element.hasChildren) {
        element.hasChildren = true;

        // We need to fire this in order for the TreeView to update this
        // element's contextValue, but it also causes to refetch the
        // element's children unnecessarily.
        // TODO: find a better way to do this.
        this._onDidChangeTreeData.fire(element);
      }
      return Object.keys(value)
        .sort(caseInsensitiveCompare)
        .map(
          key => new DatabaseProviderItem(key, path, account, project)
        );
    }
  }
}

export class DatabaseProviderItem extends vscode.TreeItem {
  contextValue = 'database.entry';
  iconPath = extContext().asAbsolutePath(
    path.join('assets', 'database', 'unknown-entry.svg')
  );
  isRemoved = false;

  private _value: DatabaseShallowValue | undefined;

  constructor(
    public name: string,
    public parentPath: string,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
  }

  markAsRemoved() {
    this.isRemoved = true;
    this.contextValue = 'database.removedEntry';
    // this.label = `<strike style="color:#A83434"><i>${this.name}</i></strike>`;
  }

  get tooltip(): string {
    if (this.isRemoved) {
      return '';
    }

    const valuePath = getFullPath(this.parentPath, this.name);
    let tooltip: string;

    if (this._value === void 0) {
      tooltip = valuePath;
    } else {
      tooltip = `• Path: ${valuePath}\n• Value: ${JSON.stringify(this._value)}`;
    }
    return tooltip;
  }

  get hasChildren(): boolean {
    return this.contextValue === 'database.parentEntry';
  }

  set hasChildren(hasChildren: boolean) {
    if (hasChildren) {
      this.contextValue = 'database.parentEntry';
      this.iconPath = extContext().asAbsolutePath(
        path.join('assets', 'valuetype', 'map.svg')
      );
    }
  }

  get value(): DatabaseShallowValue | undefined {
    return this._value!;
  }

  set value(value: DatabaseShallowValue | undefined) {
    this._value = value;

    if (value === undefined) {
      this.hasChildren = true;
    } else {
      this.contextValue = 'database.valueEntry';
      this.label = this.name;
      this.description = JSON.stringify(this._value);
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;

      let type: string;
      const typeofValue = typeof value;

      if (
        typeofValue === 'string' ||
        typeofValue === 'number' ||
        typeofValue === 'boolean'
      ) {
        type = typeofValue;
      } else if (Array.isArray(typeofValue)) {
        type = 'array';
      } else if (value === null) {
        type = 'null';
      } else {
        // Shouldn't happen, but just in case
        type = 'map';
      }

      this.iconPath = extContext().asAbsolutePath(
        path.join('assets', 'valuetype', `${type}.svg`)
      );
    }
  }
}

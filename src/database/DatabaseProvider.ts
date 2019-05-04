import * as vscode from 'vscode';
import { FirebaseProject } from '../projects/ProjectManager';
import { DatabaseAPI, DatabaseShallowValue } from './api';
import {
  caseInsensitiveCompare,
  messageTreeItem,
  getFullPath,
  getFilePath
} from '../utils';
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
    let instance: string;
    let path: string;
    let atTheRoot: boolean;

    if (!element) {
      // We're at the root, so first we need to check if the project has more
      // than one database instance.
      const instances = await api.listDatabases();
      atTheRoot = true;

      if (instances.length === 0) {
        // There are no database instances database
        return [
          messageTreeItem(
            'No database instance for this project',
            'There is no database instance associated for this project. Refresh to fetch any updates.'
          )
        ];
      } else if (instances.length > 1) {
        // More than 1 database instances
        return instances.map(inst => {
          return new DatabaseInstanceItem(
            inst.instance,
            inst.type === 'DEFAULT_REALTIME_DATABASE',
            account,
            project
          );
        });
      } else {
        // Only 1 database instance
        path = '';
        instance = instances[0].instance;
      }
    } else if (element instanceof DatabaseInstanceItem) {
      atTheRoot = true;
      path = '';
      instance = element.name;
    } else {
      atTheRoot = false;
      path = getFullPath(element.parentPath, element.name);
      instance = element.instance;
    }

    let value: DatabaseShallowValue;

    try {
      value = await api.getShallow(path, instance);
    } catch (err) {
      if (err.statusCode && err.statusCode === 423) {
        // Database is disabled
        return [
          messageTreeItem(
            `Manually disabled for this ${!element ? 'project' : 'instance'}`,
            'This database has been disabled by a database owner. Refresh to fetch any updates.'
          )
        ];
      } else {
        throw err;
      }
    }

    if (atTheRoot && value === null) {
      // Nothing in the database
      return [
        messageTreeItem(
          `Database is empty for this ${!element ? 'project' : 'instance'}`,
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
      if (atTheRoot) {
        if (value !== null) {
          console.log(
            'The root of the database is not supposed to have values, only fields!'
          );
        }
      } else if (element instanceof DatabaseElementItem) {
        element.value = value;
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
      }
      return [];
    } else {
      // It's a nested object
      if (element instanceof DatabaseElementItem && !element.hasChildren) {
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
          key => new DatabaseElementItem(key, path, instance, account, project)
        );
    }
  }
}

export class DatabaseElementItem extends vscode.TreeItem {
  contextValue = 'database.entry';
  iconPath = getFilePath('assets', 'database', 'unknown-entry.svg');
  isRemoved = false;

  private _value: DatabaseShallowValue | undefined;

  constructor(
    public name: string,
    public parentPath: string,
    public instance: string,
    public accountInfo: AccountInfo,
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
      this.iconPath = getFilePath('assets', 'valuetype', 'map.svg');
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

      this.iconPath = getFilePath('assets', 'valuetype', `${type}.svg`);
    }
  }
}

export class DatabaseInstanceItem extends vscode.TreeItem {
  contextValue = 'database.instance';
  iconPath = {
    dark: getFilePath('assets', 'database', 'dark', 'database.svg'),
    light: getFilePath('assets', 'database', 'light', 'database.svg')
  };

  constructor(
    public name: string,
    public isDefault: boolean,
    public accountInfo: AccountInfo,
    public project: FirebaseProject
  ) {
    super(
      name,
      vscode.TreeItemCollapsibleState[isDefault ? 'Expanded' : 'Collapsed']
    );

    if (isDefault) {
      this.description = '(default)';
    }
  }
}

export type DatabaseProviderItem = DatabaseElementItem | DatabaseInstanceItem;

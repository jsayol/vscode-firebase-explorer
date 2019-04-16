import * as vscode from 'vscode';
import * as directoryTree from 'directory-tree';
import { AccountInfo } from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem, getFilePath, contains } from '../utils';
import {
  ModsAPI,
  ModDeployment,
  ModResource,
  ModResourceFunction
} from './api';
import {
  getResourceTypeName,
  isFunctionsResource,
  getFunctionEventType,
  isServiceAccountResource
} from './utils';
import { CloudFunctionTriggerType } from '../functions/api';
import { RoleInformation } from '../projects/api';

export class ModsProvider implements vscode.TreeDataProvider<ModsProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ModsProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: ModsProviderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: ModsProviderItem): vscode.TreeItem {
    return element;
  }

  getParent(element: ModsProviderItem): ModsProviderItem | undefined {
    if (element instanceof ModDeploymentItem) {
      return undefined;
    } else {
      return element.parent;
    }
  }

  async getChildren(element?: ModsProviderItem): Promise<ModsProviderItem[]> {
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

    const api = ModsAPI.for(account, project);

    if (!element) {
      let mods: ModDeployment[];

      try {
        mods = await api.listMods();
      } catch (err) {
        if (err.statusCode === 403) {
          return [
            messageTreeItem(
              'Not enabled for this project',
              err.error.error.errors[0].message
            )
          ];
        } else {
          return [
            messageTreeItem(
              'Failed to retrieve installed Mods',
              `
                Something went wrong while retrieving the list of
                installed Firebase Mods for this project.
              `,
              'alert'
            )
          ];
        }
      }

      if (mods.length === 0) {
        return [
          messageTreeItem(
            'No Mods installed for this project',
            `
              There are no installed Firebase Mods for this project.
              Refresh to fetch any updates.
            `
          )
        ];
      } else {
        return mods.map(mod => new ModDeploymentItem(account, project, mod));
      }
    } else if (element instanceof ModDeploymentItem) {
      return [
        new ModInfoItem(element, element.mod, 'insertTime'),
        new ModFolderItem(element, element.mod, 'Resources', 'resources')
      ];
    } else if (element instanceof ModFolderItem) {
      if (element.type === 'resources') {
        const resources = await api.getResources(element.mod);
        return resources.map(
          resource =>
            new ModResourceItem(
              element,
              account,
              project,
              element.mod,
              resource
            )
        );
      } else if (element.type === 'environment') {
        const vars = (element.options!.resource as ModResourceFunction)
          .properties.environmentVariables;
        return Object.keys(vars)
          .filter(varName => contains(vars, varName))
          .map(
            varName =>
              new ModInfoItem(
                element,
                element.mod,
                'envvar',
                varName,
                vars[varName]
              )
          );
      } else if (element.type === 'fnSrc') {
        const dirTree = directoryTree(element.options!.parent!.sourceCodeDir!);
        if (dirTree.type !== 'directory') {
          throw new Error('Source code directory is not a directory!');
        }
        return dirTree.children!.map(
          child => new ModFunctionSourceItem(child, element)
        );
      } else {
        console.error(`[Mods] Unknown folder type ${element.type}`);
        return [];
      }
    } else if (element instanceof ModResourceItem) {
      if (isFunctionsResource(element.resource)) {
        const items: ModsProviderItem[] = [
          new ModResourceInfoItem(element, 'type'),
          new ModResourceInfoItem(element, 'trigger')
        ];

        if (element.triggerType === CloudFunctionTriggerType.Event) {
          items.push(new ModResourceInfoItem(element, 'event'));
        }

        items.splice(
          items.length,
          0,
          new ModResourceInfoItem(element, 'runtime'),
          new ModResourceInfoItem(element, 'location'),
          new ModResourceInfoItem(element, 'function'),
          new ModFolderItem(
            element,
            element.mod,
            'Env. Variables',
            'environment',
            {
              collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
              resource: element.resource
            }
          )
        );

        if (element.sourceCodeDir) {
          items.push(
            new ModFolderItem(element, element.mod, 'Source Code', 'fnSrc', {
              srcDir: element.sourceCodeDir,
              parent: element
            })
          );
        }

        return items;
      } else if (isServiceAccountResource(element.resource)) {
        const roles = await api.getRolesForServiceAccount(element.resource);
        return roles.map(
          role => new ModResourceInfoItem(element, 'role', role)
        );
      } else {
        return [];
      }
    } else if (element instanceof ModFunctionSourceItem) {
      return element.tree.children!.map(
        child => new ModFunctionSourceItem(child, element)
      );
    } else {
      return [];
    }
  }
}

export class ModDeploymentItem extends vscode.TreeItem {
  contextValue = 'mods.deployment';
  iconPath = getFilePath('assets', 'blue-hexagon.svg');

  constructor(
    public account: AccountInfo,
    public project: FirebaseProject,
    public mod: ModDeployment
  ) {
    super('', vscode.TreeItemCollapsibleState.Collapsed);

    if (mod.operation.error) {
      // There was an error during deployment of this mod. Let's not
      // load any further.
      const error = mod.operation.error;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = getFilePath('assets', 'alert-red.svg');
      this.tooltip = 'Deployment Error!';
      if (Array.isArray(error.errors) && error.errors.length > 0) {
        this.tooltip += ' Message: ' + error.errors[0].message;
      }
    }

    this.label = mod.name;
  }
}

export class ModInfoItem extends vscode.TreeItem {
  contextValue = `mods.deployment.info`;
  collapsibleState = vscode.TreeItemCollapsibleState.None;

  constructor(
    public parent: ModsProviderItem,
    public mod: ModDeployment,
    field: string,
    public name?: string,
    public value?: string
  ) {
    super('');

    if (field === 'insertTime') {
      this.label = 'Created:';
      const date = new Date(mod.insertTime);
      this.description = date.toLocaleString();
      this.tooltip = mod.insertTime;
      this.iconPath = {
        light: getFilePath('assets', 'light', 'calendar-clock.svg'),
        dark: getFilePath('assets', 'dark', 'calendar-clock.svg')
      };
    } else if (field === 'envvar') {
      this.label = name!;
      this.description = value!;
      this.tooltip = value;
      this.contextValue = 'mods.deployment.resource.envvar';
      this.iconPath = getFilePath('assets', 'valuetype', 'string.svg');
    }
  }
}

export class ModFolderItem extends vscode.TreeItem {
  contextValue = `mods.resources`;
  iconPath = vscode.ThemeIcon.Folder;
  collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

  constructor(
    public parent: ModsProviderItem,
    public mod: ModDeployment,
    name: string,
    public type: string,
    public options?: {
      collapsibleState?: vscode.TreeItemCollapsibleState;
      resource?: ModResource;
      srcDir?: string;
      parent?: ModResourceItem;
    }
  ) {
    super(name);
    this.tooltip = name;
    this.resourceUri = vscode.Uri.file(type);

    if (options && options.collapsibleState) {
      this.collapsibleState = options.collapsibleState;
    }
  }
}

export class ModResourceItem extends vscode.TreeItem {
  contextValue = `mods.resources.item`;
  type: string;
  sourceCodeDir?: string;

  // For Cloud Functions
  triggerType?: CloudFunctionTriggerType;
  eventTypeInfo?: string[];

  constructor(
    public parent: ModsProviderItem,
    public account: AccountInfo,
    public project: FirebaseProject,
    public mod: ModDeployment,
    public resource: ModResource
  ) {
    super(resource.name);
    this.type = getResourceTypeName(resource.type);

    if (isFunctionsResource(resource)) {
      this.contextValue += '.function';
      if (resource.properties.httpsTrigger) {
        this.triggerType = CloudFunctionTriggerType.HTTPS;
        this.description = 'HTTPS';
      } else if (resource.properties.eventTrigger) {
        this.triggerType = CloudFunctionTriggerType.Event;
        this.eventTypeInfo = getFunctionEventType(
          resource.properties.eventTrigger.eventType
        );
        this.description = this.eventTypeInfo[0];
      } else {
        this.triggerType = CloudFunctionTriggerType.Other;
        this.description = 'Other';
      }

      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.iconPath = {
        light: getFilePath(
          'assets',
          'functions',
          'light',
          `${this.triggerType}-trigger.svg`
        ),
        dark: getFilePath(
          'assets',
          'functions',
          'dark',
          `${this.triggerType}-trigger.svg`
        )
      };
    } else if (isServiceAccountResource(resource)) {
      this.label = 'Roles';
      // this.description = resource.properties.accountId;
      this.tooltip = `Service Account: ${resource.properties.accountId}`;
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
      this.iconPath = {
        light: getFilePath('assets', 'light', 'key.svg'),
        dark: getFilePath('assets', 'dark', 'key.svg')
      };
    } else {
      // For now we don't show any details for other types of resources
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.iconPath = {
        light: getFilePath('assets', 'light', 'cloud-outline.svg'),
        dark: getFilePath('assets', 'dark', 'cloud-outline.svg')
      };
    }
  }

  setSourceDir(dirPath: string) {
    this.sourceCodeDir = dirPath;
    this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
  }
}

export class ModResourceInfoItem extends vscode.TreeItem {
  contextValue = `mods.resources.item.info`;
  collapsibleState = vscode.TreeItemCollapsibleState.None;
  iconPath = {
    light: getFilePath('assets', 'light', 'circle-medium.svg'),
    dark: getFilePath('assets', 'dark', 'circle-medium.svg')
  };
  resourceItem: ModResourceItem;

  constructor(
    public parent: ModsProviderItem,
    field: string,
    role?: RoleInformation
  ) {
    super('');
    this.resourceItem = parent as ModResourceItem;

    const resource = this.resourceItem.resource as ModResourceFunction;

    if (field === 'type') {
      this.label = 'Type:';
      this.description = this.resourceItem.type;
    } else if (field === 'trigger') {
      this.label = 'Trigger:';
      this.description =
        this.resourceItem.triggerType === CloudFunctionTriggerType.HTTPS
          ? this.resourceItem.description
          : this.resourceItem.eventTypeInfo![0];
    } else if (field === 'event') {
      this.label = 'Event:';
      this.description = this.resourceItem.eventTypeInfo![1];
    } else if (field === 'runtime') {
      this.label = 'Runtime:';
      this.description = resource.properties.runtime;
    } else if (field === 'location') {
      this.label = 'Location:';
      this.description = resource.properties.location;
    } else if (field === 'function') {
      this.label = 'Function:';
      this.description = resource.properties.function;
    } else if (field === 'role' && role) {
      this.label = role.title;
      this.description = role.name;
      this.tooltip = role.description;
    } else {
      console.error(`[Mods] Unknown resource info field "${field}"`);
      this.label = field;
      this.description = 'Unknown';
    }

    this.tooltip = this.tooltip || (this.description as string);
  }
}

export class ModFunctionSourceItem extends vscode.TreeItem {
  constructor(
    public tree: ReturnType<typeof directoryTree>,
    public parent: ModsProviderItem
  ) {
    super(tree.name);

    this.resourceUri = vscode.Uri.parse(
      'firebase-explorer-readonly:' + tree.path
    );

    if (tree.type === 'directory') {
      this.iconPath = vscode.ThemeIcon.Folder;
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      this.iconPath = vscode.ThemeIcon.File;
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
      this.command = {
        command: 'vscode.open',
        title: '',
        arguments: [this.resourceUri]
      };
    }
  }
}

export type ModsProviderItem =
  | ModDeploymentItem
  | ModInfoItem
  | ModFolderItem
  | ModResourceItem
  | ModResourceInfoItem
  | ModFunctionSourceItem;

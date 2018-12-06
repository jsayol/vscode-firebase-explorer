import * as path from 'path';
import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject } from '../projects/ProjectManager';
import { FirestoreAPI } from './api';

export class FirestoreProvider
  implements vscode.TreeDataProvider<FirestoreProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FirestoreProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FirestoreProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: FirestoreProviderItem
  ): Promise<FirestoreProviderItem[]> {
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

    const api = FirestoreAPI.for(account, project);

    if (!element) {
      const collections = await api.listCollections('');

      if (!Array.isArray(collections.collectionIds)) {
        return [];
      }

      return collections.collectionIds.map(
        id => new CollectionItem(id, '', account, project)
      );
    } else if (element instanceof CollectionItem) {
      const colPath = getFullPath(element.parentPath, element.name);
      const documents = await api.listDocuments(colPath);

      if (!Array.isArray(documents.documents)) {
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
        return [];
      }

      return documents.documents.map(
        doc => new DocumentItem(doc.name, colPath, account, project)
      );
    } else if (element instanceof DocumentItem) {
      const docPath = getFullPath(element.parentPath, element.name);
      const collections = await api.listCollections(docPath);

      if (!Array.isArray(collections.collectionIds)) {
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
        return [];
      }

      return collections.collectionIds.map(
        id => new CollectionItem(id, docPath, account, project)
      );
    } else {
      // error?
      console.error('Should not happen!', element);
      return [];
    }
  }
}

export class CollectionItem extends vscode.TreeItem {
  contextValue = 'collection';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'forestore-collection.svg'
  );

  constructor(
    public name: string,
    public parentPath: string,
    public account: AccountInfo,
    public project: FirebaseProject,
    public readonly command?: vscode.Command
  ) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return getFullPath(this.parentPath, this.name);
  }
}

export class DocumentItem extends vscode.TreeItem {
  contextValue = 'document';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'forestore-document.svg'
  );

  readonly command: vscode.Command;

  name: string;

  constructor(
    public fullName: string,
    public parentPath: string,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super('', vscode.TreeItemCollapsibleState.Collapsed);
    this.name = this.fullName.split('/').slice(-1)[0];
    this.label = this.name;
    this.command = {
      command: 'firebaseExplorer.documentSelection',
      title: '',
      arguments: [
        this.account,
        this.project,
        getFullPath(this.parentPath, this.name)
      ]
    };
  }

  get tooltip(): string {
    return this.fullName;
  }
}

function getFullPath(parentPath: string, name: string) {
  return [parentPath, name].filter(Boolean).join('/');
}

export type FirestoreProviderItem = CollectionItem | DocumentItem;

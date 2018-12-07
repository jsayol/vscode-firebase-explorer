import * as path from 'path';
import * as vscode from 'vscode';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject } from '../projects/ProjectManager';
import {
  FirestoreAPI,
  DocumentFieldValue,
  processFieldValue,
  getFieldValue,
  FirestoreDocument
} from './api';
import { messageTreeItem, setContext, ContextValue, getFullPath } from '../utils';

export class FirestoreProvider
  implements vscode.TreeDataProvider<FirestoreProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    FirestoreProviderItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) {}

  refresh(element?: FirestoreProviderItem): void {
    this._onDidChangeTreeData.fire(element);
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

    if (project === null) {
      return [messageTreeItem('Loading...')];
    }

    if (!account || !project) {
      // No selected account or project
      return [];
    }

    const api = FirestoreAPI.for(account, project);

    if (!element) {
      try {
        const collections = await api.listCollections('');
        setContext(ContextValue.FirestoreLoaded, true);

        if (!Array.isArray(collections.collectionIds)) {
          return [];
        }

        if (collections.collectionIds.length === 0) {
          return [
            messageTreeItem(
              'Firestore is empty for this project',
              'There is no data in Firestore. Refresh to fetch any updates.'
            )
          ];
        }

        return collections.collectionIds.map(
          id => new CollectionItem(id, '', account, project)
        );
      } catch (err) {
        return [
          messageTreeItem(
            'Firestore is not enabled for this project',
            err.error.error.message
          )
        ];
      }
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
      let items: FirestoreProviderItem[] = [];

      const [collections, document] = await Promise.all([
        api.listCollections(docPath),
        api.getDocument(docPath)
      ]);

      // Store the document data in the element for future reference
      // (for example, if we want to copy its data to clipboard)
      element.document = document;

      const hasCollections = Array.isArray(collections.collectionIds);
      const hasFields = !!document.fields;

      if (hasCollections) {
        items.push(
          ...collections.collectionIds.map(
            id => new CollectionItem(id, docPath, account, project)
          )
        );
      }

      if (hasFields) {
        const docFields = Object.keys(document.fields!).sort();
        items.push(
          ...docFields.map(
            name => new DocumentFieldItem(name, document.fields![name])
          )
        );
      }

      if (!hasCollections && !hasFields) {
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
      }

      return items;
    } else if (element instanceof DocumentFieldItem) {
      return Object.keys(element.value.fields)
        .sort()
        .map(
          key => new DocumentFieldItem(key, element.value.fields[key], true)
        );
    } else {
      // error?
      console.error('Should not happen!', element);
      return [];
    }
  }
}

export class CollectionItem extends vscode.TreeItem {
  contextValue = 'firestore.collection';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'firestore/collection.svg'
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
  contextValue = 'firestore.document';
  iconPath = path.join(
    __filename,
    '..',
    '..',
    '..',
    'assets',
    'firestore/document.svg'
  );
  document?: FirestoreDocument;

  // readonly command: vscode.Command;

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
    // this.command = {
    //   command: 'firebaseExplorer.documentSelection',
    //   title: '',
    //   arguments: [
    //     this.account,
    //     this.project,
    //     getFullPath(this.parentPath, this.name)
    //   ]
    // };
  }

  get tooltip(): string {
    return this.fullName;
  }
}

export class DocumentFieldItem extends vscode.TreeItem {
  contextValue = 'firestore.documentField';
  iconPath: string;
  type: string;
  value: any;
  escapedValue?: string;

  constructor(
    public name: string,
    public fieldValue: DocumentFieldValue,
    expand = false
  ) {
    super('');

    const { type, value } = processFieldValue(fieldValue);
    this.type = type;
    this.value = value;

    const typeIcon = type === 'integer' || type === 'double' ? 'number' : type;
    this.iconPath = path.join(
      __filename,
      '..',
      '..',
      '..',
      'assets',
      `valuetype/${typeIcon}.svg`
    );

    if (type === 'map') {
      this.collapsibleState = expand
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    if (type !== 'map') {
      this.escapedValue = JSON.stringify(getFieldValue(this.fieldValue))
        .replace('<', '&lt;')
        .replace('>', '&gt;');
      this.label = `${name} : <code>${this.escapedValue}</code>`;
    } else {
      this.label = name;
    }
  }

  get tooltip(): string {
    let tooltip = `• Type: ${this.type}`;

    if (typeof this.escapedValue !== 'undefined') {
      tooltip += `\n• Value: ${this.escapedValue}`;
    }

    return tooltip;
  }
}

export type FirestoreProviderItem =
  | CollectionItem
  | DocumentItem
  | DocumentFieldItem;

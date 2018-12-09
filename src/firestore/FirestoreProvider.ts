import * as path from 'path';
import * as vscode from 'vscode';
import { FirebaseProject } from '../projects/ProjectManager';
import {
  FirestoreAPI,
  DocumentFieldValue,
  processFieldValue,
  getFieldValue,
  FirestoreDocument,
  DocumentValueType,
  FieldValue,
  CollectionsList
} from './api';
import {
  messageTreeItem,
  setContext,
  ContextValue,
  getFullPath,
  decimalToDMS
} from '../utils';
import { AccountInfo } from '../accounts/AccountManager';

const ASSETS_PATH = './assets';

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

        if (
          !Array.isArray(collections.collectionIds) ||
          collections.collectionIds.length === 0
        ) {
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
        doc => new DocumentItem(doc, colPath, account, project)
      );
    } else if (element instanceof DocumentItem) {
      const docPath = getFullPath(element.parentPath, element.name);
      let items: FirestoreProviderItem[] = [];

      const { document, collections } = await getDocumentAndCollectionsAtPath(
        docPath,
        api,
        element.document
      );

      items.push(
        ...collections.map(
          id => new CollectionItem(id, docPath, account, project)
        )
      );

      const hasFields = document && !!document.fields;
      if (hasFields) {
        const docFields = Object.keys(document!.fields!).sort();
        items.push(
          ...docFields.map(
            name =>
              new DocumentFieldItem(
                element.project,
                name,
                document!.fields![name]
              )
          )
        );
      }

      if (document) {
        // Store the document data in the element for future reference
        // (for example, if we want to copy its data to clipboard)
        element.document = document;
      }

      if (collections.length === 0 && !hasFields) {
        element.collapsibleState = vscode.TreeItemCollapsibleState.None;
        this._onDidChangeTreeData.fire(element);
      }

      return items;
    } else if (element instanceof DocumentFieldItem) {
      if (element.type === 'reference') {
        const databaseMatch = element.fieldValue.referenceValue.match(
          /projects\/([^\/]+)\/databases\/\(default\)\/documents\//
        );
        if (!databaseMatch || databaseMatch[1] !== element.project.projectId) {
          return [messageTreeItem('Reference to another database')];
        }

        let items: FirestoreProviderItem[] = [];
        const docPath = element.escapedValue!;

        const { document, collections } = await getDocumentAndCollectionsAtPath(
          docPath,
          api
        );

        items.push(
          ...collections.map(
            id => new CollectionItem(id, docPath, account, project)
          )
        );

        if (document && document.fields) {
          const docFields = Object.keys(document.fields).sort();
          items.push(
            ...docFields.map(
              name =>
                new DocumentFieldItem(
                  element.project,
                  name,
                  document!.fields![name]
                )
            )
          );
        }

        return items;
      } else if (element.type === 'map') {
        return Object.keys(element.value)
          .sort()
          .map(
            key =>
              new DocumentFieldItem(
                element.project,
                key,
                element.value[key],
                true
              )
          );
      } else if (element.type === 'array') {
        return ((element.value || []) as DocumentFieldValue[]).map(
          (value, pos) =>
            new DocumentFieldItem(element.project, String(pos), value, true)
        );
      } else {
        // Any other DocumentFieldItem shouldn't be expandable
        console.error('Should not happen!', element);
        return [];
      }
    } else {
      console.error('Should not happen!', element);
      return [];
    }
  }
}

export class CollectionItem extends vscode.TreeItem {
  contextValue = 'firestore.collection';
  iconPath = path.resolve(ASSETS_PATH, 'firestore/collection.svg');

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
  iconPath = path.resolve(ASSETS_PATH, 'firestore/document.svg');

  name: string;
  fullName: string;
  isRemoved = false;

  constructor(
    public document: FirestoreDocument,
    public parentPath: string,
    public account: AccountInfo,
    public project: FirebaseProject
  ) {
    super('', vscode.TreeItemCollapsibleState.Collapsed);
    this.fullName = document.name;
    this.name = this.fullName.split('/').slice(-1)[0];
  }

  markAsRemoved() {
    this.isRemoved = true;
    this.contextValue = 'firestore.removedDocument';

    if (this.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
      // TODO: check if it has subcollections, and set collapsibleState
      // to None if it doesn't
    }
  }

  get label(): string {
    if (this.isRemoved) {
      return `<strike style="color:#A83434"><i>${this.name}</i></strike>`;
    } else {
      return this.document.createTime ? this.name : `<i>${this.name}</i>`;
    }
  }

  set label(label: string) {
    // Dummy no-op
    label = label;
  }

  get tooltip(): string {
    let tooltip = getFullPath(this.parentPath, this.name);

    if (!this.document.createTime) {
      tooltip +=
        '\n\nThis document does not exist, it will not appear in queries or snapshots.';
    }

    return tooltip;
  }
}

export class DocumentFieldItem<
  T extends FieldValue = any
> extends vscode.TreeItem {
  contextValue = 'firestore.documentField';
  iconPath: string;
  type: DocumentValueType;
  value: T;
  escapedValue?: string;

  constructor(
    public project: FirebaseProject,
    public name: string,
    public fieldValue: DocumentFieldValue,
    expand = true
  ) {
    super('');

    const processed = processFieldValue(fieldValue);
    this.type = processed.type;
    this.value = processed.value as T;

    const typeIcon =
      processed.type === 'integer' || processed.type === 'double'
        ? 'number'
        : processed.type;
    this.iconPath = path.resolve(ASSETS_PATH, `valuetype/${typeIcon}.svg`);

    if (processed.type === 'map' || processed.type === 'array') {
      this.collapsibleState = expand
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    } else if (processed.type === 'reference') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    } else {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    }

    if (
      processed.type === 'map' ||
      (processed.type === 'array' && processed.value !== undefined)
    ) {
      this.label = name;
    } else {
      if (processed.type === 'geopoint') {
        this.escapedValue =
          decimalToDMS(processed.value.latitude, 'lat') +
          ', ' +
          decimalToDMS(processed.value.longitude, 'lon');
      } else {
        this.escapedValue = getFieldValue(this.fieldValue);

        if (processed.type === 'timestamp') {
          this.escapedValue = new Date(this.escapedValue!).toUTCString();
        } else if (processed.type !== 'reference') {
          // If it's a reference we don't want to show it quoted
          this.escapedValue = JSON.stringify(this.escapedValue);
        }

        if (this.escapedValue === undefined) {
          this.escapedValue = '<i>undefined</i>';
        } else {
          this.escapedValue = this.escapedValue
            .replace('<', '&lt;')
            .replace('>', '&gt;');
        }
      }

      this.label = `${name} : <code>${this.escapedValue}</code>`;
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

async function getDocumentAndCollectionsAtPath(
  docPath: string,
  api: FirestoreAPI,
  currentDoc?: FirestoreDocument
): Promise<{
  document: FirestoreDocument | null;
  collections: CollectionsList['collectionIds'];
}> {
  const [collections, document] = await Promise.all([
    api.listCollections(docPath),
    !currentDoc || currentDoc.createTime
      ? api.getDocument(docPath).catch(() => null)
      : Promise.resolve(null)
  ]);

  return {
    document,
    collections: Array.isArray(collections.collectionIds)
      ? collections.collectionIds
      : []
  };
}

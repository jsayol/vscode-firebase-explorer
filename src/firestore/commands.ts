import * as vscode from 'vscode';
import { providerStore } from '../stores';
import {
  FirestoreProviderItem,
  FirestoreProvider,
  DocumentFieldItem,
  DocumentItem,
  CollectionItem
} from './FirestoreProvider';
import { getFieldValue, FirestoreAPI } from './api';
import { getFullPath } from '../utils';

export function registerFirestoreCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.refresh',
      providerRefresh
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.refreshCollection',
      providerRefresh
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copyItemName',
      copyItemName
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copyItemPath',
      copyItemPath
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copySnippet.JS.ref',
      copySnippetJS_ref
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copySnippet.JS.doc.onSnapshot',
      copySnippetJS_doc_onSnapshot
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copySnippet.JS.collection.onSnapshot',
      copySnippetJS_collection_onSnapshot
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.deleteDocument',
      deleteDocument
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.refreshDocument',
      providerRefresh
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.refreshDocumentField',
      providerRefresh
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copyDocumentContent',
      copyDocumentContent
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copyDocumentFieldName',
      copyDocumentFieldName
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.firestore.copyDocumentFieldValue',
      copyDocumentFieldValue
    )
  );
}

function providerRefresh(element?: FirestoreProviderItem): void {
  const firestoreProvider = providerStore.get<FirestoreProvider>('firestore');
  firestoreProvider.refresh(element);
}

function copyItemName(element: CollectionItem | DocumentItem): void {
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(element.name);
}

function copyItemPath(element: CollectionItem | DocumentItem): void {
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(
    '/' + getFullPath(element.parentPath, element.name)
  );
}

function copySnippetJS_ref(element: CollectionItem | DocumentItem): void {
  if (!element) {
    return;
  }

  const method = element instanceof CollectionItem ? 'collection' : 'doc';
  const fullPath = getFullPath(element.parentPath, element.name);
  vscode.env.clipboard.writeText(
    `firebase.firestore().${method}('${fullPath}')`
  );
}

function copySnippetJS_doc_onSnapshot(element: DocumentItem): void {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);
  vscode.env.clipboard.writeText(
    [
      `const ref = firebase.firestore().doc('${fullPath}');`,
      `ref.onSnapshot((doc) => {`,
      `  const data = doc.data();`,
      `  // ...`,
      `});`
    ].join('\n')
  );
}

function copySnippetJS_collection_onSnapshot(element: CollectionItem): void {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);
  vscode.env.clipboard.writeText(
    [
      `const ref = firebase.firestore().collection('${fullPath}');`,
      `ref.onSnapshot((snapshot) => {`,
      `  snapshot.forEach((doc) => {`,
      `    const data = doc.data();`,
      `    // ...`,
      `  });`,
      `});`
    ].join('\n')
  );
}

async function copyDocumentContent(element: DocumentItem): Promise<void> {
  if (!element) {
    return;
  }

  // Documents that have been deleted don't have a "createTime" property
  if (element.document.createTime && !element.document.fields) {
    element.document = await vscode.window.withProgress(
      {
        title: 'Fetching document contents...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        const api = FirestoreAPI.for(element.account, element.project);
        const docPath = getFullPath(element.parentPath, element.name);
        return api.getDocument(docPath);
      }
    );
  }

  if (element.document.fields) {
    const fields = element.document.fields;

    const value = Object.keys(fields).reduce(
      (result, key) => {
        result[key] = getFieldValue(fields[key]);
        return result;
      },
      {} as { [k: string]: any }
    );

    return vscode.env.clipboard.writeText(JSON.stringify(value, null, 2));
  }
}

async function deleteDocument(element: DocumentItem): Promise<void> {
  if (!element) {
    return;
  }

  const fullPath = getFullPath(element.parentPath, element.name);

  const confirmation = await vscode.window.showWarningMessage(
    `Delete document "${element.name}"?\n\n` +
      'Subcollections will not be deleted.\n\n' +
      `/${fullPath}`,
    { modal: true },
    'Delete'
  );

  if (confirmation === 'Delete') {
    await vscode.window.withProgress(
      {
        title: 'Deleting document...',
        location: vscode.ProgressLocation.Notification
      },
      async () => {
        const api = FirestoreAPI.for(element.account, element.project);
        const docPath = getFullPath(element.parentPath, element.name);
        await api.deleteDocument(docPath);
        const firestoreProvider = providerStore.get<FirestoreProvider>(
          'firestore'
        );
        element.markAsRemoved();
        firestoreProvider.refresh(element);
      }
    );
  }
}

function copyDocumentFieldName(element: DocumentFieldItem): void {
  if (!element) {
    return;
  }

  vscode.env.clipboard.writeText(element.name);
}

function copyDocumentFieldValue(element: DocumentFieldItem): void {
  if (!element) {
    return;
  }

  try {
    let value = JSON.stringify(getFieldValue(element.fieldValue));
    vscode.env.clipboard.writeText(value);
  } catch (err) {
    console.error(err);
  }
}

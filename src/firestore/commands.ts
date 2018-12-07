import * as vscode from 'vscode';
import * as clipboardy from 'clipboardy';
import { ProviderStore } from '../ProviderStore';
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
  const firestoreProvider = ProviderStore.get<FirestoreProvider>('firestore');
  firestoreProvider.refresh(element);
}

function copyItemName(element: CollectionItem | DocumentItem): void {
  clipboardy.write(element.name);
}

function copyItemPath(element: CollectionItem | DocumentItem): void {
  clipboardy.write('/' + getFullPath(element.parentPath, element.name));
}

async function copyDocumentContent(element: DocumentItem): Promise<void> {
  if (!element.document) {
    element.document = await vscode.window.withProgress(
      {
        title: 'Fetching document data...',
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

    return clipboardy.write(JSON.stringify(value, null, 2));
  }
}

function copyDocumentFieldName(element: DocumentFieldItem): void {
  clipboardy.write(element.name);
}

function copyDocumentFieldValue(element: DocumentFieldItem): void {
  try {
    const value = JSON.stringify(getFieldValue(element.fieldValue), null, 2);
    clipboardy.write(value);
  } catch (err) {
    console.error(err);
  }
}

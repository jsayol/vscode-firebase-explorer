import * as vscode from 'vscode';
import { providerStore } from '../stores';
import {
  FirestoreProviderItem,
  FirestoreProvider,
  DocumentFieldItem,
  DocumentItem,
  CollectionItem
} from './FirestoreProvider';
import {
  getFieldValue,
  FirestoreAPI,
  processFieldValue,
  DocumentFieldValue,
  EditableDocumentField
} from './api';
import {
  getFullPath,
  contains,
  postToPanel,
  readFile,
  getFilePath
} from '../utils';

let context: vscode.ExtensionContext;
const panelViews: {
  [k: string]: {
    panel: vscode.WebviewPanel;
    isReady: boolean;
  };
} = {};

export function registerFirestoreCommands(_context: vscode.ExtensionContext) {
  context = _context;

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
      'firebaseExplorer.firestore.editDocument',
      editDocument
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

  await ensureDocumentFields(element);

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

async function editDocument(element: DocumentItem): Promise<void> {
  if (!element) {
    return;
  }

  await ensureDocumentFields(element);

  // TODO: remove
  console.log(element.document);

  const panelId = element.account.user.email + '--' + element.fullName;

  try {
    if (contains(panelViews, panelId)) {
      const { panel, isReady } = panelViews[panelId];
      if (isReady) {
        setImmediate(() => {
          postToPanel(panel, {
            command: 'fetchNew'
          });
        });
      }
      panel.reveal();
    } else {
      const docNameMatch = element.fullName.match(
        /projects\/([^\/]+)\/databases\/([^\/]+)\/documents\/(.*)/
      );
      const documentPath = docNameMatch![3];
      const panel = vscode.window.createWebviewPanel(
        'firestore.editDocument',
        'Edit: ' + documentPath,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = await readFile(
        getFilePath('ui/firestore/edit-document.html'),
        'utf8'
      );

      panel.webview.onDidReceiveMessage(async data => {
        switch (data.command) {
          case 'ready':
            panelViews[panelId] = {
              ...panelViews[panelId],
              isReady: true
            };
            postToPanel(panel, {
              command: 'initialize',
              data: {
                path: documentPath,
                fields: getFieldsForEditing(element.document.fields)
              }
            });
            break;
          case 'save':
            // TODO
            break;
        }
      });

      // panel.onDidChangeViewState(
      //   _event => {
      //     const panel = _event.webviewPanel;
      //   },
      //   null,
      //   context.subscriptions
      // );

      panel.onDidDispose(
        () => {
          delete panelViews[panelId];
        },
        null,
        context.subscriptions
      );

      panelViews[panelId] = { panel, isReady: false };
    }
  } catch (err) {
    console.log(err);
  }
}

function getFieldsForEditing(
  fields: { [name: string]: DocumentFieldValue } | undefined
): EditableDocumentField[] {
  let fieldValues: EditableDocumentField[] = [];

  if (fields) {
    for (const fieldName in fields) {
      fieldValues.push(getFieldForEditing(fields[fieldName], fieldName));
    }
  }

  return fieldValues;
}

function getFieldForEditing(
  field: DocumentFieldValue,
  fieldName?: string
): EditableDocumentField {
  const processedField = processFieldValue(field);
  let editableField: Partial<EditableDocumentField> = {
    name: fieldName,
    type: processedField.type
  };

  if (processedField.type === 'array') {
    editableField.value = (processedField.value || []).map(fieldValue => {
      return getFieldForEditing(fieldValue);
    });
  } else if (processedField.type === 'map') {
    editableField.value = getFieldsForEditing(processedField.value);
  } else {
    editableField.value = processedField.value;
  }
  return editableField as EditableDocumentField;
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

/**
 * Checks if the document has its fields. If not, it retrieves them.
 */
async function ensureDocumentFields(element: DocumentItem): Promise<void> {
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
}

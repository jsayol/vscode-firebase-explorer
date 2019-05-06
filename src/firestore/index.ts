import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerFirestoreCommands } from './commands';
import { FirestoreProvider } from './provider';

export function initializeFirestoreModule(context: vscode.ExtensionContext) {
  registerFirestoreCommands(context);
  registerProvider('firestore', new FirestoreProvider(context));
}

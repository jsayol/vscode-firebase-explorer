import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerDatabaseCommands } from './commands';
import { DatabaseProvider } from './provider';

export function initializeDatabaseModule(context: vscode.ExtensionContext) {
  registerDatabaseCommands(context);
  registerProvider('database', new DatabaseProvider(context));
}

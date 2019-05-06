import * as vscode from 'vscode';
import { registerAccountsCommands } from './commands';

export function initializeAccountsModule(context: vscode.ExtensionContext) {
  registerAccountsCommands(context);
}

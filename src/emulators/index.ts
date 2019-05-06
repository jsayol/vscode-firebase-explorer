import * as vscode from 'vscode';
import { registerEmulatorsCommands } from './commands';

export function initializeEmulatorsModule(context: vscode.ExtensionContext) {
  registerEmulatorsCommands(context);
}

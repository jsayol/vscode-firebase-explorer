import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerFunctionsCommands } from './commands';
import { FunctionsProvider } from './provider';

export function initializeFunctionsModule(context: vscode.ExtensionContext) {
  registerFunctionsCommands(context);
  registerProvider('functions', new FunctionsProvider(context));
}

import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerAppsCommands } from './commands';
import { AppsProvider } from './provider';

export function initializeAppsModule(context: vscode.ExtensionContext) {
  registerAppsCommands(context);
  registerProvider('apps', new AppsProvider(context));
}

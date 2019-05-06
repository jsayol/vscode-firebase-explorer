import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerHostingCommands } from './commands';
import { HostingProvider } from './provider';

export function initializeHostingModule(context: vscode.ExtensionContext) {
  registerHostingCommands(context);
  registerProvider('hosting', new HostingProvider(context));
}

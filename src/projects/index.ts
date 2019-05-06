import * as vscode from 'vscode';
import { registerProvider } from '../utils';
import { registerProjectsCommands } from './commands';
import { ProjectsProvider } from './provider';

export function initializeProjectsModule(context: vscode.ExtensionContext) {
  registerProjectsCommands(context);
  registerProvider('projects', new ProjectsProvider());
}

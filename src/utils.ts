import * as vscode from 'vscode';

export const EXTENSION_VERSION = 1;

let _context: vscode.ExtensionContext;

export function contains(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function messageTreeItem(msg: string, tooltip?: string): any {
  const item = new vscode.TreeItem(
    `<i>${msg}</i>`,
    vscode.TreeItemCollapsibleState.None
  );
  item.tooltip = tooltip;
  item.iconPath = undefined;
  return item;
}

export function getFullPath(parentPath: string, name: string) {
  return [parentPath, name].filter(Boolean).join('/');
}

export function setContext(key: ContextValue, value: any): void {
  vscode.commands.executeCommand('setContext', 'firebase:' + key, value);
}

export enum ContextValue {
  ProjectSelected = 'projects:selected',
  AppsLoaded = 'apps:loaded',
  FirestoreLoaded = 'firestore:loaded',
  DatabaseLoaded = 'database:loaded'
}

export function setContextObj(context: vscode.ExtensionContext) {
  _context = context;
}

export function getContextObj(): vscode.ExtensionContext {
  return _context;
}

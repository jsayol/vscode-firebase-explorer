import * as vscode from 'vscode';
import { ShaCertificate } from './apps/apps';

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

export function getCertTypeForFingerprint(
  shaHash: string
): ShaCertificate['certType'] | null {
  const pattern = /^(([0-9a-fA-F]{2}:){19}|([0-9a-fA-F]{2}){19})([0-9a-fA-F]){2}$|^(([0-9a-fA-F]{2}:){31}|([0-9a-fA-F]{2}){31})([0-9a-fA-F]){2}$/;

  if (!pattern.test(shaHash)) {
    return null;
  }

  if (shaHash.length === 59) {
    return 'SHA_1';
  } else {
    return 'SHA_256';
  }
}

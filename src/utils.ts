import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ShaCertificate } from './apps/apps';

const ASSETS_PATH = './assets';
let _context: vscode.ExtensionContext;

export function contains(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function messageTreeItem(
  msg: string,
  tooltip?: string,
  icon?: 'info' | 'alert'
): any {
  const item = new vscode.TreeItem(
    `<i>${msg}</i>`,
    vscode.TreeItemCollapsibleState.None
  );
  item.tooltip = tooltip;

  if (icon) {
    item.iconPath = {
      light: path.resolve(ASSETS_PATH, `light/${icon}.svg`),
      dark: path.resolve(ASSETS_PATH, `dark/${icon}.svg`)
    };
  } else {
    item.iconPath = undefined;
  }
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
  FunctionsLoaded = 'functions:loaded',
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

export function decimalToDMS(value: number, type: 'lat' | 'lon'): string {
  const absValue = Math.abs(value);
  const degrees = Math.floor(absValue);
  const minutes = Math.floor((absValue - degrees) * 60);
  const seconds =
    Math.round((absValue - degrees - minutes / 60) * 3600 * 1000) / 1000;

  const isPositive = value >= 0;
  let direction: 'N' | 'S' | 'E' | 'W';

  if (type === 'lat') {
    direction = isPositive ? 'N' : 'S';
  } else {
    direction = isPositive ? 'E' : 'W';
  }

  let result: string[] = [direction];

  if (seconds) {
    result.push(`${seconds}"`);
  }

  if (minutes || seconds) {
    result.push(`${minutes}'`);
  }

  result.push(`${degrees}°`);

  // return `${degrees}° ${minutes}' ${seconds}" ${direction}`;
  return result.reverse().join(' ');
}

export function generateNonce(): string {
  return Math.round(Math.random() * (2 << 29) + 1).toString();
}

export const readFile = promisify(fs.readFile);

export function getFilePath(filename: string) {
  return path.resolve('./', filename);
}

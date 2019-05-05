import * as fs from 'fs';
import { URL } from 'url';
import * as path from 'path';
import * as https from 'https';
import { IncomingMessage } from 'http';
import { promisify } from 'util';
import * as yauzl from 'yauzl';
import * as tmp from 'tmp';
import * as mkdirp from 'mkdirp';
import { Readable } from 'stream';
import * as vscode from 'vscode';
import * as AnsiUp from 'ansi_up';
import { ShaCertificate } from './apps/apps';

const ansiUp: AnsiUp.AnsiUp = new (AnsiUp as any).default();
ansiUp.use_classes = true;

let _context: vscode.ExtensionContext;

// export function contains(obj: object, key: string): boolean {
export function contains<T>(obj: T, key: PropertyKey): key is keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function messageTreeItem(
  msg: string,
  tooltip?: string,
  icon?: 'info' | 'alert'
): any {
  const item = new vscode.TreeItem('', vscode.TreeItemCollapsibleState.None);
  item.tooltip = tooltip;
  item.description = msg;

  if (icon) {
    item.iconPath = {
      light: getFilePath('assets', 'light', `${icon}.svg`),
      dark: getFilePath('assets', 'dark', `${icon}.svg`)
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
  HostingLoaded = 'hosting:loaded',
  FunctionsLoaded = 'functions:loaded',
  AppsLoaded = 'apps:loaded',
  FirestoreLoaded = 'firestore:loaded',
  DatabaseLoaded = 'database:loaded',
  ModsLoaded = 'mods:loaded'
}

export function setContextObj(context: vscode.ExtensionContext) {
  _context = context;
}

export function getContext(): vscode.ExtensionContext {
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

export function httpsGet(
  url: string | URL,
  options?: https.RequestOptions
): Promise<IncomingMessage> {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const callback = (response: IncomingMessage) => {
      (response as any).end = new Promise(resolve =>
        response.on('end', resolve)
      );
      resolve(response);
    };

    if (options === undefined) {
      https.get(url, callback).on('error', reject);
    } else {
      https.get(url, options, callback).on('error', reject);
    }
  });
}

export function getFilePath(...filenameParts: string[]): string {
  return getContext().asAbsolutePath(path.join(...filenameParts));
}

interface DirectoryResult {
  path: string;
  cleanup(): void;
}

interface FileResult extends DirectoryResult {
  fd: number;
}

function createTmpDir(options?: tmp.Options): Promise<DirectoryResult> {
  return new Promise((resolve, reject) => {
    tmp.dir(options || {}, (err, path, cleanup) => {
      if (err) {
        reject(err);
      } else {
        resolve({ path, cleanup });
      }
    });
  });
}

function createTmpFile(options?: tmp.Options): Promise<FileResult> {
  return new Promise((resolve, reject) => {
    tmp.file(options || {}, (err, path, fd, cleanup) => {
      if (err) {
        reject(err);
      } else {
        resolve({ path, fd, cleanup });
      }
    });
  });
}

export async function downloadToTmpFile(url: string): Promise<FileResult> {
  const response = await httpsGet(url);
  return writeToTmpFile(response);
}

export async function writeToTmpFile(
  content: string | Readable,
  options?: tmp.Options
): Promise<FileResult> {
  return new Promise<FileResult>(async (resolve, reject) => {
    const tmpFile = await createTmpFile(options);
    const writeStream = fs.createWriteStream(tmpFile.path);

    let readStream;

    if (typeof content === 'string') {
      readStream = new Readable();
      readStream.push(content);
      readStream.push(null);
    } else {
      readStream = content;
    }

    readStream.pipe(
      writeStream,
      { end: true }
    );

    writeStream.on('finish', async () => {
      writeStream.close();
    });

    writeStream.on('close', async () => {
      resolve(tmpFile);
    });

    writeStream.on('error', err => {
      tmpFile.cleanup();
      reject(err);
    });
  });
}

export async function unzipToTmpDir(
  filePath: string
): Promise<DirectoryResult> {
  return new Promise<DirectoryResult>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, async (err, zipFile) => {
      if (err) {
        reject(err);
        return;
      }

      if (!zipFile) {
        reject(new Error('No zip file!'));
        return;
      }

      const tmpDir = await createTmpDir({ unsafeCleanup: true });

      zipFile.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          // Directory file names end with '/'.
          // Note that entires for directories themselves are optional.
          // An entry's fileName implicitly requires its parent directories to exist.
          zipFile.readEntry();
        } else {
          // File entry
          zipFile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(err);
              return;
            }

            if (!readStream) {
              reject('No readStream');
              return;
            }

            unzipToTmpDir_handleStreams(
              readStream,
              tmpDir.path,
              entry.fileName
            );

            readStream.on('end', () => {
              zipFile.readEntry();
            });
          });
        }
      });

      zipFile.once('end', () => {
        resolve(tmpDir);
      });

      zipFile.readEntry();
    });
  });
}

function unzipToTmpDir_handleStreams(
  readStream: Readable,
  tmpDirPath: string,
  fileName: string
) {
  const filePath = path.join(tmpDirPath, fileName);
  const writeStream = fs.createWriteStream(filePath);

  writeStream.on('open', () => {
    readStream.pipe(
      writeStream,
      { end: true }
    );
  });

  writeStream.on('finish', async () => {
    writeStream.close();
  });

  writeStream.on('error', err => {
    if (err.code === 'ENOENT') {
      // Creating the writeStream failed because the path to the
      // file doesn't exists. Let's create it and try again.
      mkdirp(path.dirname(filePath), (err, made) => {
        if (err || !made) {
          throw err || 'Failed creating directory';
        }
        unzipToTmpDir_handleStreams(readStream, tmpDirPath, fileName);
      });
    } else {
      throw err;
    }
  });
}

export interface UnzipToDirResult {
  dir: DirectoryResult;
  files: UnzippedFileOrDirectory[];
}

export type UnzippedFileOrDirectory = UnzippedFile | UnzippedDirectory;

export interface UnzippedFile {
  fileName: string;
  fullPath: string;
}

export interface UnzippedDirectory {
  name: string;
  files: UnzippedFileOrDirectory[];
}

export function dateToString(date: Date | string) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Performs a case-insensitive comparison of two strings
 */
export function caseInsensitiveCompare(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

const webviewPanels: {
  [id: string]: {
    panel: vscode.WebviewPanel;
    buffer: any[];
    disposable: vscode.Disposable;
  };
} = {};

export function createWebviewPanel(
  id: string,
  viewType: string,
  title: string,
  showOptions:
    | vscode.ViewColumn
    | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
  options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    viewType,
    title,
    showOptions,
    options
  );

  const disposable = panel.onDidChangeViewState(event => {
    if (event.webviewPanel.visible) {
      flushPanelBuffer(id);
    }
  });

  webviewPanels[id] = {
    panel,
    buffer: [],
    disposable
  };

  return panel;
}

export function getWebviewPanel(id: string): vscode.WebviewPanel | null {
  if (!contains(webviewPanels, id)) {
    return null;
  }
  return webviewPanels[id].panel;
}

export function deleteWebviewPanel(id: string): void {
  webviewPanels[id].disposable.dispose();
  delete webviewPanels[id];
}

/**
 * Post a message to a webview panel.
 * If the panel is not visible, it buffers the message until it can be sent.
 */
export function postToPanel(id: string, msg: any) {
  try {
    if (!contains(webviewPanels, id)) {
      console.error(`Cannot send message to inexistent WebView panel "${id}"`);
      return;
    }
    const { panel, buffer } = webviewPanels[id];
    if (panel.visible) {
      panel.webview.postMessage(msg).then(sent => {
        if (!sent) {
          buffer.push(msg);
        }
      });
    } else {
      buffer.push(msg);
    }
  } catch (err) {
    console.error('Failed sending message to WebView panel', err);
  }
}

function flushPanelBuffer(id: string) {
  if (contains(webviewPanels, id)) {
    webviewPanels[id].buffer.forEach(msg => {
      webviewPanels[id].panel.webview.postMessage(msg);
    });
    webviewPanels[id].buffer = [];
  }
}

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error);
});

export function ansiToHTML(text: string): string {
  return ansiUp.ansi_to_html(text);
}

export function replaceResources(content: string): string {
  const { extensionPath } = getContext();

  return content.replace(/{{ *resource: *([^}]+) *}}/g, (_, resource) => {
    const filePath = vscode.Uri.file(path.join(extensionPath, resource));
    return filePath.with({ scheme: 'vscode-resource' }).toString();
  });
}

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

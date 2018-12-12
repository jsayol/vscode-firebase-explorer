import * as fs from 'fs';
import { URL } from 'url';
import * as path from 'path';
import * as https from 'https';
import { IncomingMessage } from 'http';
import { promisify } from 'util';
import * as yauzl from 'yauzl';
import * as tmp from 'tmp-promise';
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
  HostingLoaded = 'hosting:loaded',
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

export function getFilePath(filename: string) {
  return path.resolve('./', filename);
}

export async function downloadToTmpFile(url: string): Promise<tmp.FileResult> {
  const response = await httpsGet(url);

  return new Promise<tmp.FileResult>(async (resolve, reject) => {
    const tmpFile = await tmp.file();
    const writeStream = fs.createWriteStream(tmpFile.path);
    response.pipe(
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
): Promise<tmp.DirectoryResult> {
  return new Promise<tmp.DirectoryResult>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, async (err, zipFile) => {
      if (err) {
        reject(err);
        return;
      }

      if (!zipFile) {
        reject(new Error('No zip file!'));
        return;
      }

      const tmpDir = await tmp.dir({ unsafeCleanup: true });

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

            readStream.on('end', () => {
              zipFile.readEntry();
            });

            const writeStream = fs.createWriteStream(
              path.join(tmpDir.path, entry.fileName)
            );

            writeStream.on('finish', async () => {
              writeStream.close();
            });

            readStream.pipe(
              writeStream,
              { end: true }
            );
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

export interface UnzipToDirResult {
  dir: tmp.DirectoryResult;
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

process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection', error);
});

import * as vscode from 'vscode';
import { spawn } from 'child_process';
import { WebSocketServer } from './server';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

export async function startEmulators(
  server: WebSocketServer,
  project: FirebaseProject | undefined,
  account: AccountInfo | undefined,
  emulators: 'all' | string[]
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;

  if (folders && project && account) {
    server.useProjectManager(ProjectManager.for(account, project));
    await server.start();

    let args = ['emulators:start', '--ws', server.getAddress()];

    if (Array.isArray(emulators)) {
      args = args.concat('--only', emulators.join(','));
    }

    // TODO: This is only while developing!
    const devFirebaseTools = '/home/josep/projects/firebase-tools';
    args = [
      '--project',
      devFirebaseTools + '/tsconfig.json',
      devFirebaseTools + '/src/bin/firebase.js',
      ...args
    ];

    const spawnOptions = {
      cwd: folders[0].uri.fsPath,
      windowsHide: true
    };

    const childProc = spawn(
      'ts-node' /* TODO: 'firebase' */,
      args,
      spawnOptions
    );

    ['message', 'close', 'exit', 'error', 'disconnect'].forEach(event => {
      childProc.on(event, (...eventArgs) => {
        console.log(event, ...eventArgs);
      });
    });
  }
}

export async function stopEmulators(server: WebSocketServer): Promise<void> {
  await server.stop();
}

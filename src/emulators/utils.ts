import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer } from './server';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { AccountManager } from '../accounts/AccountManager';

const EMULATORS_START_COMMAND = 'emulators:start';

let cliProcess: ChildProcess | undefined;

export async function startEmulators(
  server: WebSocketServer,
  workspacePath: string,
  email: string,
  projectId: string,
  emulators: 'all' | string[]
): Promise<void> {
  server.useProjectManager(ProjectManager.for(email, projectId));
  await server.start();

  return new Promise(async resolve => {
    try {
      let args = [EMULATORS_START_COMMAND, '--ws', server.getAddress()];

      if (Array.isArray(emulators)) {
        args = args.concat('--only', emulators.join(','));
      }

      const spawnOptions = {
        cwd: workspacePath,
        windowsHide: true
      };

      // TODO: This is only while developing!
      const devFirebaseTools = '/home/josep/projects/firebase-tools';
      args = [devFirebaseTools + '/lib/bin/firebase.js', ...args];
      cliProcess = spawn('node' /* TODO: 'firebase' */, args, spawnOptions);
      // cliProcess = spawn('firebase' */, args, spawnOptions);

      cliProcess.once('exit', (code, signal) => {
        console.log('ChildProcess exit:', code, signal);
        cliProcess = undefined;
        resolve();
      });
    } catch (err) {
      console.error('Error while starting the emulators:', err);
      await stopEmulators(server);
      resolve();
    }
  });
}

export async function stopEmulators(server: WebSocketServer): Promise<void> {
  await server.stop();

  if (cliProcess) {
    if (cliProcess.killed) {
      cliProcess = undefined;
      return;
    }

    return new Promise(resolve => {
      cliProcess!.once('exit', () => {
        cliProcess = undefined;
        resolve();
      });
      cliProcess!.kill('SIGINT');
    });
  }
}

export async function listAllProjects(): Promise<
  Array<{
    email: string;
    projects: FirebaseProject[];
  }>
> {
  const accounts = AccountManager.getAccounts();
  const accountsWithProjects: Array<{
    email: string;
    projects: FirebaseProject[];
  }> = [];

  await Promise.all(
    accounts.map(async account => {
      const projects = await AccountManager.for(account).listProjects({
        refresh: false
      });
      accountsWithProjects.push({ email: account.user.email, projects });
    })
  );

  return accountsWithProjects;
}

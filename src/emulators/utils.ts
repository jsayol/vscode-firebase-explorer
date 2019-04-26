import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer } from './server';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { AccountManager } from '../accounts/AccountManager';

const EMULATORS_START_COMMAND = 'emulators:start';

let cliProcess: ChildProcess;

export async function startEmulators(
  server: WebSocketServer,
  workspacePath: string,
  email: string,
  projectId: string,
  emulators: 'all' | string[]
): Promise<void> {
  server.useProjectManager(ProjectManager.for(email, projectId));
  await server.start();

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

  ['message', 'close', 'exit', 'error', 'disconnect'].forEach(event => {
    cliProcess.on(event, (...eventArgs) => {
      console.log(event, ...eventArgs);
    });
  });
}

export async function stopEmulators(server: WebSocketServer): Promise<void> {
  await server.stop();
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

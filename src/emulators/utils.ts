import { spawn } from 'child_process';
import { WebSocketServer } from './server';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { AccountManager } from '../accounts/AccountManager';

export async function startEmulators(
  server: WebSocketServer,
  workspacePath: string,
  email: string,
  projectId: string,
  emulators: 'all' | string[]
): Promise<void> {
  server.useProjectManager(ProjectManager.for(email, projectId));
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
    cwd: workspacePath,
    windowsHide: true
  };

  const childProc = spawn('ts-node' /* TODO: 'firebase' */, args, spawnOptions);

  ['message', 'close', 'exit', 'error', 'disconnect'].forEach(event => {
    childProc.on(event, (...eventArgs) => {
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

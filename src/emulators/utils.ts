import * as linkify from 'linkify-urls';
import { spawn, ChildProcess } from 'child_process';
import { WebSocketServer } from './server';
import { ProjectManager, FirebaseProject } from '../projects/ProjectManager';
import { AccountManager } from '../accounts/AccountManager';
import { webviewPanels, postToPanel, ansiToHTML } from '../utils';

const listeningProcesses = require('listening-processes');

const EMULATORS_START_COMMAND = 'emulators:start';

let cliProcess: ChildProcess | undefined;

export async function startEmulators(
  server: WebSocketServer,
  workspacePath: string,
  email: string,
  projectId: string,
  emulators: 'all' | string[],
  debug: boolean
): Promise<void> {
  server.useProjectManager(ProjectManager.for(email, projectId));
  await server.start();

  return new Promise(async resolve => {
    try {
      let args = [EMULATORS_START_COMMAND, '--ws', server.getAddress()];

      if (Array.isArray(emulators)) {
        args = args.concat('--only', emulators.join(','));
      }

      if (debug) {
        args.push('--debug');
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
      await stopEmulators();
      resolve();
    }
  });
}

export async function stopEmulators(): Promise<void> {
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

export async function prepareServerStart(
  server: WebSocketServer,
  data: {
    path: string;
    email: string;
    projectId: string;
    emulators: 'all' | string[];
    debug: boolean;
  }
): Promise<void> {
  server.on('stdout', (line) => {
    if (webviewPanels.emulators) {
      postToPanel(webviewPanels.emulators, {
        command: 'stdout',
        message: linkify(ansiToHTML(line))
      });
    }
  });

  server.on('stderr', (line) => {
    if (webviewPanels.emulators) {
      postToPanel(webviewPanels.emulators, {
        command: 'stderr',
        message: linkify(ansiToHTML(line))
      });
    }
  });

  server.on('log', logEntry => {
    if (webviewPanels.emulators) {
      postToPanel(webviewPanels.emulators, {
        command: 'log',
        message: logEntry
      });
    }
  });

  server.on('close', () => {
    server.clearListeners();
  });

  server.on('emulator-port-taken', emulator => {
    let processInfo = findWhoHasPort(emulator.addr.port);
    postToPanel(webviewPanels.emulators!, {
      command: 'emulator-port-taken',
      emulator,
      processInfo
    });
  });

  const { path, email, projectId, emulators, debug } = data;

  // This promise resolves when the child process exits
  await startEmulators(server, path, email, projectId, emulators, debug);
  // The CLI has exited

  if (webviewPanels.emulators) {
    postToPanel(webviewPanels.emulators, { command: 'stopped' });
    server.clearListeners();
  }
}

export function findWhoHasPort(port: number | string): any {
  let processInfo: any = null;

  try {
    // TODO: check if this works on windows & mac
    const procs = listeningProcesses();
    const portToFind = Number(port);

    for (const [, value] of Object.entries(procs)) {
      const proc = (value as any[]).find(
        proc => Number(proc.port) === portToFind
      );
      if (proc) {
        processInfo = proc;
        break; // for-loop
      }
    }
  } catch (err) {
    // Something went wrong while listing processes with open ports
  }

  return processInfo;
}

export async function killProcess(pid: number | string): Promise<boolean> {
  // TODO: listeningProcesses.kill() sends a SIGKILL, which is quite brute force.
  // Maybe find a way to send a SIGINT first? If the process is still
  // running after a certain timeout has passsed, then try with SIGKILL.
  pid = Number(pid);
  const { success } = listeningProcesses.kill(pid);
  return (success as number[]).includes(pid);
}

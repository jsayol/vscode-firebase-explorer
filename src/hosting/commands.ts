import * as vscode from 'vscode';
import { HostingFileItem } from './HostingProvider';

let context: vscode.ExtensionContext;

export function registerHostingCommands(_context: vscode.ExtensionContext) {
  context = _context;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'firebaseExplorer.hosting.openFile',
      openFile
    )
  );
}

async function openFile(element: HostingFileItem): Promise<void> {
  if (!element) {
    return;
  }

  const release = element.release;
  const file = element.part.file!;
  console.log({ release, file });
}

import * as vscode from 'vscode';
import { HostingFileItem } from './HostingProvider';

export function registerHostingCommands(context: vscode.ExtensionContext) {
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

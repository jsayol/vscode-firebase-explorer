import * as vscode from 'vscode';
import * as ua from 'universal-analytics';
const uuidv4 = require('uuid/v4');

/**
 * Collects anonymous analytics data.
 */
class Analytics {
  visitor?: ua.Visitor;

  initialize(context: vscode.ExtensionContext) {
    let uuid = context.globalState.get<string>('uuid');

    if (!uuid) {
      uuid = uuidv4();
      context.globalState.update('uuid', uuid);
    }

    this.visitor = ua('UA-61049586-2', uuid!);

    this.visitor.set('cd1', EXTENSION_VERSION);
    this.visitor.set('cd2', PRODUCTION);
    this.visitor.set('cd3', vscode.version);
    this.visitor.set('cd4', process.platform);
  }

  event(category: string, action: string): void;
  event(category: string, action: string, label: string, value: number): void;
  event(
    category: string,
    action: string,
    label?: string,
    value?: number
  ): void {
    const callback = (err: Error | null) => {
      if (!PRODUCTION && err) {
        console.error('Failed reporting analytics event:', err);
      }
    };

    if (label !== undefined) {
      if (!Number.isInteger(value!) || value! < 0) {
        throw new Error('Event value must be a positive integer');
      }
      this.visitor!.event(category, action, label, value!, callback);
    } else {
      this.visitor!.event(category, action, callback);
    }
  }
}

export const analytics = new Analytics();

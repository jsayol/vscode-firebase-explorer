import * as vscode from 'vscode';

const providers: { [k: string]: any } = {};

export const ProviderStore = {
  get<T>(name: string): T {
    return providers[name] as T;
  },

  add<T>(name: string, provider: vscode.TreeDataProvider<T>): void {
    providers[name] = provider;
  }
};

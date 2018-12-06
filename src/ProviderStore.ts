import * as vscode from 'vscode';

const providers: { [k: string]: vscode.TreeDataProvider<any> } = {};

export const ProviderStore = {
  get<T>(name: string): T {
    return (providers[name] as unknown) as T;
  },

  add<T>(name: string, provider: vscode.TreeDataProvider<T>): void {
    providers[name] = provider;
  }
};

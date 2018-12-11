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

const treeViews: { [k: string]: any } = {};

export const TreeViewStore = {
  get<T>(name: string): vscode.TreeView<T> {
    return treeViews[name] as vscode.TreeView<T>;
  },

  add<T>(name: string, treeView: vscode.TreeView<T>): void {
    treeViews[name] = treeView;
  }
};

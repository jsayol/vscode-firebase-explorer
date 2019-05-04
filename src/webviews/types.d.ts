declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: <T>(newState: T) => T;
  getState: () => any;
};

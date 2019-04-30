import * as WebSocket from 'ws';
import * as util from 'util';
import * as portfinder from 'portfinder';
import { ProjectManager } from '../projects/ProjectManager';

const PORT_START = 35000;
const ALIVE_CHECK_INTERVAL = 1000; // ms

function getRandomPort(host: string): Promise<number> {
  return portfinder.getPortPromise({ host, port: PORT_START });
}

const inspectOpts = {
  ...util.inspect.defaultOptions,
  depth: null,
  colors: true
};

function log(...args: any[]): void {
  args = args.map(arg =>
    typeof arg === 'string' ? arg : util.inspect(arg, inspectOpts)
  );
  console.log(...args);
}

function noop(..._: any[]): void {
  // noop
}

interface WebSocketClient extends WebSocket {
  isAlive?: boolean;
  fbTools?: {
    version: string;
  };
}

interface WebSocketDebuggerInitData {
  client: {
    name: string;
    version: string;
  };
  firebaseConfig: { [k: string]: any };
  projectNumber: string;
  node: {
    useVersion?: string; // major version number
    installIfMissing: boolean;
  };
}

type SendMessageType = 'init' | 'stop' | 'error' | 'web-config';
type RecvMessageType =
  | 'init'
  | 'log'
  | 'error'
  | 'stdout'
  | 'stderr'
  | 'pid'
  | 'emulator-port-taken'
  | 'get-web-config';

export type ListenerEventType = RecvMessageType | 'close';

export class WebSocketServer {
  private server: WebSocket.Server;
  private pingInterval: any;
  private projectManager?: ProjectManager;
  private listeners = new Map<ListenerEventType, Set<Function>>();
  private isStarted = false;
  private client?: WebSocketClient | null;

  constructor(public host = 'localhost') {
    this.server = null as any;
  }

  start(): Promise<void> {
    if (this.isStarted) {
      return Promise.resolve();
    }

    this.isStarted = true;

    return new Promise(
      async (resolve, reject): Promise<void> => {
        try {
          const port = await getRandomPort(this.host);

          this.server = new WebSocket.Server({
            port: port,
            host: this.host
          });

          this.server.on('listening', () => {
            resolve();
          });

          this.server.on('error', async err => {
            reject(err);
            await this.stop();
          });

          this.server.on('connection', (newClient: WebSocketClient) => {
            if (this.client) {
              // Refuse the connection if there's already a connected client
              newClient.close();
            } else {
              this.onConnection(newClient);
            }
          });

          this.pingInterval = setInterval(() => {
            this.server.clients.forEach((client: WebSocketClient) => {
              if (client.isAlive === false) {
                return client.terminate();
              }

              client.isAlive = false;
              client.ping(noop);
            });
          }, ALIVE_CHECK_INTERVAL);
        } catch (err) {
          reject(err);
        }
      }
    );
  }

  async stop() {
    this.isStarted = false;
    clearInterval(this.pingInterval);
    if (this.client) {
      await this.sendMessage(this.client, 'stop');
    }
  }

  getAddress(): string {
    const serverAddr = this.server.address();

    if (typeof serverAddr === 'string') {
      return serverAddr;
    } else {
      return `ws://${serverAddr.address}:${serverAddr.port}`;
    }
  }

  useProjectManager(projectManager: ProjectManager): void {
    this.projectManager = projectManager;
  }

  on(type: ListenerEventType, callback: (payload: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set<typeof callback>());
    }

    const listeners = this.listeners.get(type);
    listeners!.add(callback);

    return () => {
      listeners!.delete(callback);
    };
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  async sendWebAppconfig(client: WebSocketClient): Promise<void> {
    const config = await this.projectManager!.getWebAppConfig();
    await this.sendMessage(client, 'web-config', config);
  }

  private onConnection(client: WebSocketClient): void {
    this.client = client;

    client.isAlive = true;

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('close', async (code, reason) => {
      this.client = null;
      await this.stop();
      this.close();
    });

    client.on('message', async (data: string) => {
      let message: any;

      try {
        message = JSON.parse(data);
      } catch (err) {
        // Couldn't parse the message sent by the client... exTERMINATE!
        // (You have to read that last part with a Dalek voice or it won't be funny)
        await this.sendMessage(client, 'error', err.message);
        client.terminate();
        return;
      }

      await this.processMessage(client, message);
    });
  }

  private async processMessage(
    client: WebSocketClient,
    message: { type: RecvMessageType; payload: any }
  ): Promise<any> {
    switch (message.type) {
      case 'init':
        client.fbTools = message.payload;
        await this.respondInit(client);
        break;
      case 'stdout':
      case 'stderr':
        break;
      case 'error':
        // TODO
        log(message);
        break;
      case 'log':
        break;
      case 'pid':
        // TODO
        break;
      case 'emulator-port-taken':
        break;
      case 'get-web-config':
        await this.sendWebAppconfig(client);
        break;
      default:
        throw new Error('Unknow message type: ' + message.type);
    }

    this.broadcastEvent(message.type, message.payload);

    return JSON.stringify(message);
  }

  private sendMessage(
    socket: WebSocketClient,
    type: SendMessageType,
    payload?: any
  ): Promise<void> {
    return new Promise(resolve => {
      const message = { type, payload };
      socket.send(JSON.stringify(message), resolve as any);
    });
  }

  private async respondInit(socket: WebSocketClient): Promise<void> {
    if (this.projectManager) {
      const payload: WebSocketDebuggerInitData = {
        client: {
          name: EXTENSION_NAME,
          version: EXTENSION_VERSION
        },
        firebaseConfig: await this.projectManager.getConfig(),
        projectNumber: this.projectManager.project.projectNumber,
        node: {
          installIfMissing: false // TODO
        }
      };
      await this.sendMessage(socket, 'init', payload);
    }
  }

  private close() {
    this.server.close();
    this.broadcastEvent('close');
  }

  private broadcastEvent(type: ListenerEventType, payload?: any): void {
    if (this.listeners.has(type)) {
      this.listeners.get(type)!.forEach(listener => {
        listener(payload);
      });
    }
  }
}

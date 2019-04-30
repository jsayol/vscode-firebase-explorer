import * as WebSocket from 'ws';
import * as util from 'util';
import * as portfinder from 'portfinder';
import { ProjectManager } from '../projects/ProjectManager';
import { EventEmitter } from 'events';

const PORT_START = 35000;
const PING_INTERVAL = 1000; // ms

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

const enum SendType {
  INIT = 'init',
  STOP = 'stop',
  ERROR = 'error',
  WEB_CONFIG = 'web-config'
}

export enum RecvType {
  INIT = 'init',
  LOG = 'log',
  ERROR = 'error',
  STDOUT = 'stdout',
  STDERR = 'stderr',
  PID = 'pid',
  EMULATOR_PORT_TAKEN = 'emulator-port-taken',
  GET_WEB_CONFIG = 'get-web-config'
}

export type ListenerType = RecvType | 'close';

const validRecvMessageTypes = Object.values(RecvType);

export class WebSocketServer extends EventEmitter {
  private server: WebSocket.Server | null;
  private pingInterval: any;
  private projectManager?: ProjectManager;
  private isStarted = false;
  private client?: WebSocketClient | null;

  constructor(public host = 'localhost') {
    super();
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
            if (this.server) {
              this.server.clients.forEach((client: WebSocketClient) => {
                if (client.isAlive === false) {
                  return client.terminate();
                }

                client.isAlive = false;
                client.ping();
              });
            }
          }, PING_INTERVAL);
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
      await this.sendMessage(this.client, SendType.STOP);
    }
  }

  getAddress(): string {
    if (!this.server) {
      throw new Error("Server hasn't been started yet.");
    }

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

  async sendWebAppconfig(client: WebSocketClient): Promise<void> {
    const config = await this.projectManager!.getWebAppConfig();
    await this.sendMessage(client, SendType.WEB_CONFIG, config);
  }

  on(event: ListenerType, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }

  emit(event: ListenerType, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }

  private onConnection(client: WebSocketClient): void {
    this.client = client;

    client.isAlive = true;

    client.on('pong', () => {
      client.isAlive = true;
    });

    client.on('close', async () => {
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
        await this.sendMessage(client, SendType.ERROR, err.message);
        client.terminate();
        return;
      }

      await this.processMessage(client, message);
    });
  }

  private async processMessage(
    client: WebSocketClient,
    message: { type: RecvType; payload: any }
  ): Promise<void> {
    if (!validRecvMessageTypes.includes(message.type)) {
      throw new Error('Unknow message type: ' + message.type);
    }

    if (message.type === RecvType.INIT) {
      client.fbTools = message.payload;
      await this.respondInit(client);
    } else if (message.type === RecvType.GET_WEB_CONFIG) {
      await this.sendWebAppconfig(client);
      return;
    } else if (message.type === RecvType.ERROR) {
      log(message);
      return;
    }

    this.emit(message.type, message.payload);
  }

  private sendMessage(
    socket: WebSocketClient,
    type: SendType,
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
      await this.sendMessage(socket, SendType.INIT, payload);
    }
  }

  private close() {
    if (!this.server) {
      throw new Error("Server hasn't ben started yet.");
    }

    this.server.close();
    this.emit('close');
  }
}

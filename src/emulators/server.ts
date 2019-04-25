import * as WebSocket from 'ws';
import * as util from 'util';
import * as portfinder from 'portfinder';
import { ProjectManager } from '../projects/ProjectManager';

const PORT_START = 35000;
const ALIVE_CHECK_INTERVAL = 5000; // ms

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

type SendMessageType = 'init' | 'stop' | 'error';
type RecvMessageType = 'init' | 'error' | 'stdout' | 'stderr';

export class WebSocketServer {
  private server: WebSocket.Server;
  private pingInterval: any;
  private projectManager?: ProjectManager;
  private clients = new Set<WebSocketClient>();

  constructor(public host = 'localhost') {
    this.server = null as any;
  }

  start(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const port = await getRandomPort(this.host);

        this.server = new WebSocket.Server({
          port: port,
          host: this.host
        });

        this.server.on('listening', () => {
          log(this.getAddress());
          resolve();
        });

        this.server.on('error', async err => {
          reject(err);
          await this.stop();
        });

        this.server.on('connection', (client: WebSocketClient) => {
          log('New connection');
          this.clients.add(client);

          client.isAlive = true;

          client.on('pong', () => {
            client.isAlive = true;
          });

          client.on('close', (code, reason) => {
            log(`Closed connection (${code}): ${reason}`);
            this.clients.delete(client);
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
        });

        this.pingInterval = setInterval(() => {
          this.server.clients.forEach((socket: WebSocketClient) => {
            if (socket.isAlive === false) {
              return socket.terminate();
            }

            socket.isAlive = false;
            socket.ping(noop);
          });
        }, ALIVE_CHECK_INTERVAL);
      } catch (err) {
        reject(err);
      }
    });
  }

  async stop() {
    log('Closing server');
    clearInterval(this.pingInterval);
    const stopClients = [...this.clients.values()].map(client =>
      this.sendMessage(client, 'stop')
    );
    await Promise.all(stopClients);
    this.server.close();
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

  private async processMessage(
    socket: WebSocketClient,
    message: { type: RecvMessageType; payload: any }
  ): Promise<any> {
    switch (message.type) {
      case 'init':
        socket.fbTools = message.payload;
        await this.respondInit(socket);
        break;
      case 'stdout':
      case 'stderr':
        // TODO
        log(message);
        break;
      case 'error':
        // TODO
        log(message);
        break;
      default:
        throw new Error('Unknow message type: ' + message.type);
    }

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
}

import * as WebSocket from 'ws';
import * as portfinder from 'portfinder';

const PORT_START = 35000;
const ALIVE_CHECK_INTERVAL = 5000; // ms

function getRandomPort(host: string): Promise<number> {
  return portfinder.getPortPromise({ host, port: PORT_START });
}

function log(...args: any[]): void {
  console.log(...args);
}

function noop(..._: any[]): void {
  // noop
}

interface MyWebSocket extends WebSocket {
  isAlive?: boolean;
  fbTools?: {
    version: string;
  };
}

interface WebSocketDebuggerInitData {
  version: string;
  projectPath: string;
  firebaseConfig: { [k: string]: any };
  projectNumber: string;
  node: {
    useVersion?: string; // major version number
    installIfMissing: boolean;
  };
}

type WebSocketMessageType = 'init' | 'stop' | 'error';

export class WebSocketServer {
  private server: WebSocket.Server;
  private pingInterval: any;

  constructor(public host = 'localhost') {
    this.server = null as any;
  }

  start(): Promise<void> {
    return new Promise(async resolve => {
      try {
        const port = await getRandomPort(this.host);

        this.server = new WebSocket.Server({
          port: port,
          host: this.host
        });

        this.server.on('listening', () => {
          const serverAddr = this.server.address();
          let address: string;

          if (typeof serverAddr === 'string') {
            address = serverAddr;
          } else {
            address = `ws://${serverAddr.address}:${serverAddr.port}`;
          }

          log(address);
        });

        this.server.on('connection', (socket: MyWebSocket) => {
          log('New connection');

          socket.isAlive = true;
          socket.on('pong', () => {
            socket.isAlive = true;
          });

          socket.on('message', async (data: string) => {
            log('Received: %s', data);
            let message: any;

            try {
              message = JSON.parse(data);
            } catch (err) {
              // Couldn't parse the message sent by the client... exTERMINATE!
              // (You have to read that last part with a Dalek voice or it won't be funny)
              this.sendMessage(socket, 'error', err.message);
              socket.terminate();
              return;
            }

            await this.processMessage(socket, message);
          });

          socket.send('something');
        });

        this.pingInterval = setInterval(() => {
          this.server.clients.forEach((socket: MyWebSocket) => {
            if (socket.isAlive === false) {
              return socket.terminate();
            }

            socket.isAlive = false;
            socket.ping(noop);
          });
        }, ALIVE_CHECK_INTERVAL);
      } catch (err) {
        log('Something went wrong:', err);
        resolve();
      }
    });
  }

  stop() {
    log('Closing server');
    clearInterval(this.pingInterval);
    this.server.close();
  }

  private async processMessage(
    socket: MyWebSocket,
    message: any
  ): Promise<any> {
    switch (message.type) {
      case 'init':
        socket.fbTools = JSON.parse(message.payload);
        this.sendInit(socket);
        break;
      default:
        throw new Error('Unknow message type: ' + message.type);
    }

    return JSON.stringify(message);
  }

  private sendMessage(
    socket: MyWebSocket,
    type: WebSocketMessageType,
    payload?: any
  ): void {
    const message = { type, payload };
    log('->', message);
    socket.send(JSON.stringify(message));
  }

  private sendInit(socket: MyWebSocket): void {
    const payload: WebSocketDebuggerInitData = {
      version: EXTENSION_VERSION,
      projectPath: '', // TODO
      firebaseConfig: {}, // TODO
      projectNumber: '', // TODO
      node: {
        installIfMissing: false // TODO
      }
    };
    this.sendMessage(socket, 'init', payload);
  }
}

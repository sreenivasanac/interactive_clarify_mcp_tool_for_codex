import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { EventEmitter } from "node:events";
import type * as vscode from "vscode";
import {
  resolveSocketPath,
  createMessageReader,
  writeMessage,
  type QuestionRequest,
  type QuestionResponse,
  type IpcMessage,
} from "@interactive-clarify/shared";

function isSocketAlreadyServed(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createConnection(socketPath);

    probe.once("connect", () => {
      probe.end();
      resolve(true);
    });

    probe.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        resolve(false);
        return;
      }

      resolve(true);
    });
  });
}

/**
 * Unix domain socket server that listens for question requests
 * from the MCP server and emits them as events.
 *
 * Events:
 *   'question' -> (request: QuestionRequest, respond: (response: QuestionResponse) => boolean)
 *   'request_disconnected' -> (requestId: string)
 */
export class IpcServer extends EventEmitter {
  private server: net.Server | undefined;
  private socketPath: string | undefined;
  private ownsSocketPath = false;
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    super();
    this.outputChannel = outputChannel;
  }

  /** Start listening on the IPC socket. */
  async start(): Promise<void> {
    this.socketPath = resolveSocketPath();
    this.ownsSocketPath = false;
    this.outputChannel.appendLine(`IPC socket path: ${this.socketPath}`);

    // Ensure parent directory exists
    const parentDir = path.dirname(this.socketPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
      this.outputChannel.appendLine(`Created directory: ${parentDir}`);
    }

    // Remove stale socket file if it exists
    if (fs.existsSync(this.socketPath)) {
      if (await isSocketAlreadyServed(this.socketPath)) {
        this.outputChannel.appendLine(
          "Another Interactive Clarify instance is already listening on the IPC socket; skipping startup in this window.",
        );
        return;
      }

      this.outputChannel.appendLine("Removing stale socket file...");
      fs.unlinkSync(this.socketPath);
    }

    return new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      this.server.on("error", (err) => {
        this.outputChannel.appendLine(`IPC server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.outputChannel.appendLine("IPC server listening.");
        this.ownsSocketPath = true;
        // Restrict socket permissions on Unix
        if (this.socketPath) {
          try {
            fs.chmodSync(this.socketPath, 0o600);
          } catch {
            // Non-critical; some platforms may not support chmod on sockets
          }
        }
        resolve();
      });
    });
  }

  /** Stop the server and clean up the socket file. */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }

    if (this.socketPath && this.ownsSocketPath && fs.existsSync(this.socketPath)) {
      try {
        fs.unlinkSync(this.socketPath);
        this.outputChannel.appendLine("Removed socket file.");
      } catch {
        // Best-effort cleanup
      }
    }

    this.ownsSocketPath = false;
  }

  /** Handle a new client connection. */
  private handleConnection(socket: net.Socket): void {
    this.outputChannel.appendLine("Client connected to IPC server.");

    const reader = createMessageReader((msg: IpcMessage) => {
      this.handleMessage(msg, socket);
    });

    socket.on("data", reader);

    socket.on("error", (err) => {
      this.outputChannel.appendLine(`Client socket error: ${err.message}`);
    });

    socket.on("close", () => {
      this.outputChannel.appendLine("Client disconnected.");
    });
  }

  /** Route an incoming IPC message. */
  private handleMessage(msg: IpcMessage, socket: net.Socket): void {
    switch (msg.type) {
      case "ping":
        writeMessage(socket, { type: "pong" });
        break;

      case "question_request": {
        const request = msg as QuestionRequest;
        let disconnectNotified = false;
        const notifyDisconnect = (): void => {
          if (disconnectNotified) {
            return;
          }
          disconnectNotified = true;
          this.emit("request_disconnected", request.requestId);
        };
        socket.once("close", notifyDisconnect);
        socket.once("error", notifyDisconnect);
        const respond = (response: QuestionResponse): boolean => {
          if (!socket.destroyed && socket.writable) {
            disconnectNotified = true;
            writeMessage(socket, response);
            // Each IPC connection handles a single request/response pair.
            socket.end();
            return true;
          }
          return false;
        };
        this.emit("question", request, respond);
        break;
      }

      default:
        this.outputChannel.appendLine(
          `Unhandled IPC message type: ${(msg as IpcMessage).type}`
        );
    }
  }
}

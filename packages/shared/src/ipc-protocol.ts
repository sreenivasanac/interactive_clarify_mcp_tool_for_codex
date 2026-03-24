import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import type { InteractiveClarifyOutput, QuestionItem } from "./types.js";
import { SOCKET_FILENAME } from "./constants.js";

// ── IPC Message Types ──

export interface QuestionRequest {
  type: "question_request";
  requestId: string;
  timestamp: number;
  questions: QuestionItem[];
}

export interface QuestionResponse {
  type: "question_response";
  requestId: string;
  status: "answered" | "cancelled" | "timeout";
  answers?: Record<string, string | string[]>;
  answerItems?: InteractiveClarifyOutput["answerItems"];
  annotations?: Record<string, { notes?: string; optionNotes?: Record<string, string> }>;
}

export interface PingMessage {
  type: "ping";
}

export interface PongMessage {
  type: "pong";
}

export type IpcMessage =
  | QuestionRequest
  | QuestionResponse
  | PingMessage
  | PongMessage;

// ── Socket Path Resolution ──

/**
 * Resolves the IPC socket path.
 * Priority:
 *  1. INTERACTIVE_CLARIFY_SOCKET env var
 *  2. XDG_RUNTIME_DIR/interactive-clarify.sock (Linux)
 *  3. ~/.interactive-clarify/ipc.sock (macOS / fallback)
 */
export function resolveSocketPath(): string {
  if (process.env.INTERACTIVE_CLARIFY_SOCKET) {
    return process.env.INTERACTIVE_CLARIFY_SOCKET;
  }

  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, SOCKET_FILENAME);
  }

  return path.join(os.homedir(), ".interactive-clarify", "ipc.sock");
}

// ── Length-Prefixed Message Framing ──
// Each message: [4-byte BE length][UTF-8 JSON payload]

/** Write a length-prefixed JSON message to a socket. */
export function writeMessage(socket: net.Socket, msg: IpcMessage): void {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  socket.write(Buffer.concat([header, payload]));
}

/**
 * Creates a message reader that accumulates data from a socket
 * and invokes the callback for each complete message.
 */
export function createMessageReader(
  onMessage: (msg: IpcMessage) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 4) {
      const msgLen = buffer.readUInt32BE(0);
      if (buffer.length < 4 + msgLen) {
        break; // incomplete message, wait for more data
      }

      const jsonBuf = buffer.subarray(4, 4 + msgLen);
      buffer = buffer.subarray(4 + msgLen);

      try {
        const msg = JSON.parse(jsonBuf.toString("utf-8")) as IpcMessage;
        onMessage(msg);
      } catch {
        // malformed message, skip
      }
    }
  };
}

import * as net from "node:net";
import * as crypto from "node:crypto";
import {
  resolveSocketPath,
  writeMessage,
  createMessageReader,
  IPC_CONNECT_TIMEOUT,
  RESPONSE_TIMEOUT,
} from "@interactive-clarify/shared";
import type {
  InteractiveClarifyInput,
  InteractiveClarifyOutput,
  QuestionRequest,
  QuestionResponse,
  IpcMessage,
} from "@interactive-clarify/shared";

/**
 * Ask the user via the IPC channel (e.g. VS Code extension).
 *
 * Connects to the Unix domain socket, sends a QuestionRequest,
 * and waits for a matching QuestionResponse.
 */
export function askViaIpc(input: InteractiveClarifyInput): Promise<InteractiveClarifyOutput> {
  return new Promise<InteractiveClarifyOutput>((resolve, reject) => {
    const socketPath = resolveSocketPath();
    const requestId = crypto.randomUUID();
    const socket = new net.Socket();

    let settled = false;

    function settle(fn: () => void): void {
      if (!settled) {
        settled = true;
        fn();
        cleanup();
      }
    }

    // -- Timeouts --

    // Connection timeout: reject if we can't connect quickly
    const connectTimer = setTimeout(() => {
      settle(() => reject(new Error("IPC connection timeout")));
    }, IPC_CONNECT_TIMEOUT);

    // Response timeout: reject if user takes too long
    let responseTimer: ReturnType<typeof setTimeout> | undefined;

    // -- Cleanup --

    function cleanup(): void {
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      socket.removeAllListeners();
      socket.destroy();
    }

    // -- Socket events --

    socket.on("error", (err) => {
      settle(() => reject(err));
    });

    socket.on("close", () => {
      settle(() => reject(new Error("IPC socket closed before response")));
    });

    socket.connect(socketPath, () => {
      clearTimeout(connectTimer);

      // Connection established -- send the request
      const request: QuestionRequest = {
        type: "question_request",
        requestId,
        timestamp: Date.now(),
        questions: input.questions,
      };
      writeMessage(socket, request);

      // Start the response timeout
      responseTimer = setTimeout(() => {
        settle(() => reject(new Error("IPC response timeout")));
      }, RESPONSE_TIMEOUT);

      // Listen for the matching response
      const reader = createMessageReader((msg: IpcMessage) => {
        if (msg.type !== "question_response") return;

        const response = msg as QuestionResponse;
        if (response.requestId !== requestId) return;

        if (response.status === "cancelled") {
          settle(() => reject(new Error("User cancelled")));
          return;
        }

        if (response.status === "timeout") {
          settle(() => reject(new Error("Response timed out on host side")));
          return;
        }

        // status === "answered"
        settle(() =>
          resolve({
            answers: response.answers ?? {},
            annotations: response.annotations,
          }),
        );
      });

      socket.on("data", reader);
    });
  });
}

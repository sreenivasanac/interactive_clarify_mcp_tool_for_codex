import * as vscode from "vscode";
import { IpcServer } from "./ipc-server";
import { WebviewManager } from "./webview/WebviewManager";
import type { QuestionRequest, QuestionResponse } from "@interactive-clarify/shared";

let ipcServer: IpcServer | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Interactive Clarify");
  outputChannel.appendLine("Interactive Clarify extension activating...");

  ipcServer = new IpcServer(outputChannel);

  ipcServer.on(
    "question",
    (request: QuestionRequest, respond: (response: QuestionResponse) => void) => {
      outputChannel.appendLine(
        `Received question request: ${request.requestId} with ${request.questions.length} question(s)`
      );

      const webviewManager = new WebviewManager(context);
      webviewManager.showQuestions(
        request.questions,
        request.requestId,
        (response: QuestionResponse) => {
          outputChannel.appendLine(
            `Sending response for ${request.requestId}: ${response.status}`
          );
          respond(response);
        }
      );
    }
  );

  ipcServer.start().then(
    () => outputChannel.appendLine("IPC server started successfully."),
    (err) => {
      outputChannel.appendLine(`Failed to start IPC server: ${err}`);
      vscode.window.showErrorMessage(
        `Interactive Clarify: Failed to start IPC server. ${err}`
      );
    }
  );

  const showPanelCmd = vscode.commands.registerCommand(
    "interactiveClarify.showPanel",
    () => {
      vscode.window.showInformationMessage(
        "Interactive Clarify: Waiting for questions from an MCP client..."
      );
    }
  );

  context.subscriptions.push(
    { dispose: () => ipcServer?.stop() },
    outputChannel,
    showPanelCmd
  );
}

export function deactivate(): void {
  if (ipcServer) {
    ipcServer.stop();
    ipcServer = undefined;
  }
}

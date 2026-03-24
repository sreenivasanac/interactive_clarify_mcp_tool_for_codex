import * as vscode from "vscode";
import * as path from "node:path";
import type { InteractiveClarifyOutput, QuestionItem, QuestionResponse } from "@interactive-clarify/shared";
import { getWebviewContent } from "./getWebviewContent";
import { saveLateResponse } from "../lateResponseStore";

/**
 * Manages the creation and lifecycle of the Interactive Clarify webview panel.
 */
export class WebviewManager {
  private context: vscode.ExtensionContext;
  private panelsByRequestId = new Map<string, vscode.WebviewPanel>();
  private disconnectedRequestIds = new Set<string>();
  private readonly lateResponseThresholdMs = 120 * 1000;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Create and display a webview panel showing the given questions.
   *
   * @param questions - Array of questions to display
   * @param requestId - The IPC request ID for correlating the response
   * @param onResponse - Callback to send the response back via IPC
   */
  showQuestions(
    questions: QuestionItem[],
    requestId: string,
    requestTimestamp: number,
    onResponse: (response: QuestionResponse) => boolean
  ): void {
    let hasResponded = false;

    const sendResponse = (response: QuestionResponse): boolean => {
      if (hasResponded) {
        return true;
      }
      hasResponded = true;
      return onResponse(response);
    };

    // Path to the bundled webview assets
    const webviewDistPath = path.join(
      this.context.extensionPath,
      "webview-dist"
    );
    const webviewDistUri = vscode.Uri.file(webviewDistPath);

    const panel = vscode.window.createWebviewPanel(
      "interactiveClarify",
      "Interactive Clarify",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [webviewDistUri],
        retainContextWhenHidden: true,
      }
    );

    panel.iconPath = undefined;
    this.panelsByRequestId.set(requestId, panel);

    // Generate and set the webview HTML content
    const panelJsUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDistPath, "panel.js"))
    );
    const panelCssUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(webviewDistPath, "panel.css"))
    );

    panel.webview.html = getWebviewContent(
      panel.webview,
      questions,
      panelJsUri,
      panelCssUri
    );

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
      (
        message: {
          type: string;
          answers?: InteractiveClarifyOutput["answers"];
          answerItems?: InteractiveClarifyOutput["answerItems"];
          annotations?: InteractiveClarifyOutput["annotations"];
        },
      ) => {
        switch (message.type) {
          case "submit":
            const response: QuestionResponse = {
              type: "question_response",
              requestId,
              status: "answered",
              answers: message.answers,
              answerItems: message.answerItems,
              annotations: message.annotations,
            };

            const isLateRequest =
              this.disconnectedRequestIds.has(requestId) ||
              Date.now() - requestTimestamp >= this.lateResponseThresholdMs;

            if (isLateRequest || !sendResponse(response)) {
              const filePath = saveLateResponse({
                requestId,
                createdAt: new Date().toISOString(),
                questions,
                answers: message.answers ?? {},
                answerItems: message.answerItems,
                annotations: message.annotations,
              });
              vscode.window.showInformationMessage(
                `Interactive Clarify: live request expired. Response saved to ${filePath}`,
              );
            }
            panel.dispose();
            break;

          case "cancel":
            sendResponse({
              type: "question_response",
              requestId,
              status: "cancelled",
            });
            panel.dispose();
            break;
        }
      },
      undefined,
      []
    );

    // If the panel is closed without responding, send a cancelled response
    panel.onDidDispose(() => {
      this.panelsByRequestId.delete(requestId);
      this.disconnectedRequestIds.delete(requestId);
      sendResponse({
        type: "question_response",
        requestId,
        status: "cancelled",
      });
    });
  }

  markRequesterDisconnected(requestId: string): void {
    this.disconnectedRequestIds.add(requestId);
    const panel = this.panelsByRequestId.get(requestId);
    if (!panel) {
      return;
    }

    void panel.webview.postMessage({
      type: "requester_disconnected",
      requestId,
    });
  }
}

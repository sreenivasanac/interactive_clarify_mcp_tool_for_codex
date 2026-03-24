import * as vscode from "vscode";
import * as path from "node:path";
import type { QuestionItem, QuestionResponse } from "@interactive-clarify/shared";
import { getWebviewContent } from "./getWebviewContent";

/**
 * Manages the creation and lifecycle of the Interactive Clarify webview panel.
 */
export class WebviewManager {
  private context: vscode.ExtensionContext;

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
    onResponse: (response: QuestionResponse) => void
  ): void {
    let hasResponded = false;

    const sendResponse = (response: QuestionResponse): void => {
      if (hasResponded) {
        return;
      }
      hasResponded = true;
      onResponse(response);
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
      (message: { type: string; answers?: Record<string, string | string[]>; annotations?: Record<string, { notes?: string }> }) => {
        switch (message.type) {
          case "submit":
            sendResponse({
              type: "question_response",
              requestId,
              status: "answered",
              answers: message.answers,
              annotations: message.annotations,
            });
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
      sendResponse({
        type: "question_response",
        requestId,
        status: "cancelled",
      });
    });
  }
}

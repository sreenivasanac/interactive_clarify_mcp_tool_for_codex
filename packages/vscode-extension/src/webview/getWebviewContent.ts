import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import type { QuestionItem } from "@interactive-clarify/shared";

/**
 * Generate a nonce string for CSP script tags.
 */
function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * Generates the full HTML document for the Interactive Clarify webview.
 *
 * @param webview - The webview instance (used for CSP source)
 * @param questions - The questions to inject into the page
 * @param panelJsUri - URI to the bundled panel.js script
 */
export function getWebviewContent(
  webview: vscode.Webview,
  questions: QuestionItem[],
  panelJsUri: vscode.Uri,
  extensionPath: string
): string {
  const nonce = getNonce();
  const cspSource = webview.cspSource;

  // Read the CSS file and inline it to guarantee it loads
  let cssContent = "";
  try {
    const cssPath = path.join(extensionPath, "webview-dist", "panel.css");
    cssContent = fs.readFileSync(cssPath, "utf-8");
  } catch {
    // CSS file missing — styles will be unstyled but functional
  }

  // Escape the questions JSON for safe embedding in a script tag
  const questionsJson = JSON.stringify(questions)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}';
             font-src ${cspSource};">
  <title>Interactive Clarify</title>
  <style>${cssContent}</style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__INTERACTIVE_CLARIFY_QUESTIONS__ = ${questionsJson};
  </script>
  <script nonce="${nonce}" src="${panelJsUri}"></script>
</body>
</html>`;
}

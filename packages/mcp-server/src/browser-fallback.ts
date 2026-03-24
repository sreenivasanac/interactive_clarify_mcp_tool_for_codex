import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type {
  InteractiveClarifyInput,
  InteractiveClarifyOutput,
  QuestionResponse,
} from "@interactive-clarify/shared";

function getAssetPaths(): { jsPath: string; cssPath: string } {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const webviewDistDir = path.resolve(currentDir, "../../vscode-extension/webview-dist");

  return {
    jsPath: path.join(webviewDistDir, "panel.js"),
    cssPath: path.join(webviewDistDir, "panel.css"),
  };
}

function openUrl(url: string): void {
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    req.on("error", reject);
  });
}

function json<T>(res: http.ServerResponse, statusCode: number, body: T): void {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function html(input: InteractiveClarifyInput): string {
  const questionsJson = JSON.stringify(input.questions)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Clarify</title>
  <link rel="stylesheet" href="/panel.css">
</head>
<body>
  <div id="root"></div>
  <script>
    window.__INTERACTIVE_CLARIFY_QUESTIONS__ = ${questionsJson};
    window.__interactiveClarifyResponded = false;
    window.__interactiveClarifyPending = false;
    window.acquireVsCodeApi = function acquireVsCodeApi() {
      return {
        async postMessage(message) {
          if (window.__interactiveClarifyPending) {
            return;
          }

          window.__interactiveClarifyPending = true;
          window.__interactiveClarifyResponded = true;

          try {
            const response = await fetch("/__interactive_clarify_response", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(message),
              keepalive: true,
            });

            if (!response.ok) {
              throw new Error("Failed to submit response");
            }

            document.body.innerHTML = '<div style="font-family: system-ui, sans-serif; padding: 32px; color: #ddd; background: #1e1e1e; min-height: 100vh;">Response submitted. You can close this window.</div>';
          } catch (error) {
            window.__interactiveClarifyResponded = false;
            window.__interactiveClarifyPending = false;
            console.error(error);
            alert("Failed to submit your response. Please try again.");
          }
        },
        getState() {
          try {
            return JSON.parse(sessionStorage.getItem("interactive-clarify-state") ?? "null");
          } catch {
            return null;
          }
        },
        setState(state) {
          sessionStorage.setItem("interactive-clarify-state", JSON.stringify(state));
        },
      };
    };

    window.addEventListener("beforeunload", () => {
      if (window.__interactiveClarifyResponded) {
        return;
      }

      const payload = JSON.stringify({ type: "cancel" });
      navigator.sendBeacon("/__interactive_clarify_response", new Blob([payload], { type: "application/json" }));
    });
  </script>
  <script src="/panel.js"></script>
</body>
</html>`;
}

export async function askViaBrowser(
  input: InteractiveClarifyInput,
): Promise<InteractiveClarifyOutput> {
  const { jsPath, cssPath } = getAssetPaths();
  await Promise.all([fs.access(jsPath), fs.access(cssPath)]);

  const js = await fs.readFile(jsPath);
  const css = await fs.readFile(cssPath);

  return new Promise<InteractiveClarifyOutput>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      server.close();
      fn();
    };

    const server = http.createServer(async (req, res) => {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

      if (req.method === "GET" && requestUrl.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html(input));
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/panel.js") {
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(js);
        return;
      }

      if (req.method === "GET" && requestUrl.pathname === "/panel.css") {
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
        return;
      }

      if (req.method === "POST" && requestUrl.pathname === "/__interactive_clarify_response") {
        try {
          const body = await readRequestBody(req);
          const message = JSON.parse(body) as {
            type?: string;
            answers?: Record<string, string | string[]>;
            annotations?: Record<string, { notes?: string }>;
          };

          if (message.type === "cancel") {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, requestId }), () => {
              settle(() => reject(new Error("User cancelled")));
            });
            return;
          }

          if (message.type === "submit") {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true, requestId }), () => {
              settle(() =>
                resolve({
                  answers: message.answers ?? {},
                  annotations: message.annotations,
                }),
              );
            });
            return;
          }

          json(res, 200, { ok: true, requestId });
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }

        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", (error) => {
      settle(() => reject(error));
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error("Browser response timeout")));
    }, 5 * 60 * 1000);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        settle(() => reject(new Error("Failed to start browser fallback server")));
        return;
      }

      openUrl(`http://127.0.0.1:${address.port}`);
    });
  });
}

import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getQuestionKey,
  RESPONSE_TIMEOUT,
  type InteractiveClarifyInput,
  type InteractiveClarifyOutput,
} from "@interactive-clarify/shared";

type SubmittedMessage = {
  type?: string;
  answers?: Record<string, string | string[]>;
  answerItems?: InteractiveClarifyOutput["answerItems"];
  annotations?: Record<string, { notes?: string; optionNotes?: Record<string, string> }>;
};

function isAnswerValue(value: unknown): value is string | string[] {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function getAssetPaths(): { jsPath: string; cssPath: string } {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateDirs = [
    path.resolve(currentDir, "../browser-assets"),
    path.resolve(currentDir, "../../vscode-extension/webview-dist"),
  ];

  const assetDir =
    candidateDirs.find((dir) => {
      const jsPath = path.join(dir, "panel.js");
      const cssPath = path.join(dir, "panel.css");
      return fsSync.existsSync(jsPath) && fsSync.existsSync(cssPath);
    }) ?? candidateDirs[0];

  return {
    jsPath: path.join(assetDir, "panel.js"),
    cssPath: path.join(assetDir, "panel.css"),
  };
}

function serializeAnswerItems(
  input: InteractiveClarifyInput,
  answers: Record<string, string | string[]>,
): NonNullable<InteractiveClarifyOutput["answerItems"]> {
  return input.questions.flatMap((question, index) => {
      const questionKey = getQuestionKey(question, index);
      const answer = answers[question.header] ?? answers[questionKey];
      if (answer === undefined) {
        return [];
      }

      return [{ id: question.id, header: question.header, answer }];
    });
}

function normalizeAnswerItems(
  answerItems: InteractiveClarifyOutput["answerItems"],
): NonNullable<InteractiveClarifyOutput["answerItems"]> {
  if (!Array.isArray(answerItems)) {
    return [];
  }

  return answerItems.flatMap((answerItem) => {
    if (!answerItem || typeof answerItem.header !== "string" || !isAnswerValue(answerItem.answer)) {
      return [];
    }

    return [
      {
        id: typeof answerItem.id === "string" ? answerItem.id : undefined,
        header: answerItem.header,
        answer: answerItem.answer,
      },
    ];
  });
}

function openUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "darwin"
        ? spawn("open", [url], { stdio: "ignore" })
        : process.platform === "win32"
          ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore" })
          : spawn("xdg-open", [url], { stdio: "ignore" });

    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
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

function createResponsePath(): string {
  return `/__interactive_clarify_response/${crypto.randomUUID()}`;
}

function serializeQuestionsForInlineScript(questions: InteractiveClarifyInput["questions"]): string {
  return JSON.stringify(questions)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function html(input: InteractiveClarifyInput, responsePath: string, browserUrl: string): string {
  const questionsJson = serializeQuestionsForInlineScript(input.questions);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Clarify</title>
  <link rel="stylesheet" href="/panel.css">
</head>
<body>
  <div style="font-family: system-ui, sans-serif; font-size: 12px; color: #98a2b3; background: #151718; border-bottom: 1px solid #2b2f31; padding: 8px 12px;">
    Browser UI running at <span style="color: #d0d5dd;">${browserUrl}</span>
  </div>
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
            const response = await fetch(${JSON.stringify(responsePath)}, {
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
      navigator.sendBeacon(${JSON.stringify(responsePath)}, new Blob([payload], { type: "application/json" }));
    });
  </script>
  <script src="/panel.js"></script>
</body>
</html>`;
}

function normalizeAnswers(
  input: InteractiveClarifyInput,
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const normalized: Record<string, string | string[]> = {};

  for (const [index, question] of input.questions.entries()) {
    const questionKey = getQuestionKey(question, index);
    const answer = answers[question.header] ?? answers[questionKey];
    if (answer !== undefined) {
      normalized[question.header] = answer;
    }
  }

  return normalized;
}

function buildOutput(
  input: InteractiveClarifyInput,
  message: SubmittedMessage,
): InteractiveClarifyOutput {
  const normalizedAnswerItems = normalizeAnswerItems(message.answerItems);
  const rawAnswers =
    message.answers ??
    Object.fromEntries(
      normalizedAnswerItems.map(({ header, answer }) => [header, answer]),
    );
  const answers = normalizeAnswers(input, rawAnswers);

  return {
    answers,
    answerItems:
      normalizedAnswerItems.length > 0
        ? normalizedAnswerItems
        : serializeAnswerItems(input, answers),
    annotations: message.annotations,
  };
}

export async function askViaBrowser(
  input: InteractiveClarifyInput,
): Promise<InteractiveClarifyOutput> {
  const { jsPath, cssPath } = getAssetPaths();
  await Promise.all([fs.access(jsPath), fs.access(cssPath)]);

  const js = await fs.readFile(jsPath);
  const css = await fs.readFile(cssPath);
  const responsePath = createResponsePath();

  return new Promise<InteractiveClarifyOutput>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    let browserUrl = "http://127.0.0.1";

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
        res.end(html(input, responsePath, browserUrl));
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

      if (req.method === "POST" && requestUrl.pathname === responsePath) {
        try {
          const body = await readRequestBody(req);
          const message = JSON.parse(body) as SubmittedMessage;

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
              settle(() => resolve(buildOutput(input, message)));
            });
            return;
          }

          json(res, 200, { ok: true, requestId });
          return;
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }

      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", (error) => {
      settle(() => reject(error));
    });

    const timeout = setTimeout(() => {
      settle(() => reject(new Error("Browser response timeout")));
    }, RESPONSE_TIMEOUT);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        settle(() => reject(new Error("Failed to start browser fallback server")));
        return;
      }

      browserUrl = `http://127.0.0.1:${address.port}`;
      console.error(`Interactive Clarify browser UI: ${browserUrl}`);

      void openUrl(browserUrl).catch((error) => {
        settle(() =>
          reject(
            new Error(
              `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`,
            ),
          ),
        );
      });
    });
  });
}

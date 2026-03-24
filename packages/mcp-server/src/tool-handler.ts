import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InteractiveClarifyInput, InteractiveClarifyOutput } from "@interactive-clarify/shared";
import { askViaIpc, isIpcUnavailableError } from "./ipc-client.js";
import { askViaBrowser } from "./browser-fallback.js";

type ClarifyMode = "auto" | "vscode" | "browser";

/**
 * Handle an interactive_clarify tool call.
 *
 * Strategy: try the IPC path first (VS Code extension),
 * and fall back to the browser UI only if the IPC connection itself fails.
 * If the user explicitly cancels, return immediately — do NOT fall back to the browser UI.
 */
export async function handleInteractiveClarify(
  input: InteractiveClarifyInput,
  mode: ClarifyMode = "auto",
): Promise<CallToolResult> {
  let output: InteractiveClarifyOutput;

  if (mode === "browser") {
    output = await askViaBrowser(input);
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
    };
  }

  try {
    output = await askViaIpc(input);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // User explicitly cancelled — return a cancellation result, don't fall back to TUI
    if (message === "User cancelled") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "cancelled",
              message: "User cancelled the clarifying questions.",
            }),
          },
        ],
        isError: true,
      };
    }

    if (mode === "vscode") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message,
            }),
          },
        ],
        isError: true,
      };
    }

    // Only fall back when the extension path is unavailable, not when it failed mid-request.
    if (!isIpcUnavailableError(err)) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "error",
              message,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      output = await askViaBrowser(input);
    } catch (browserErr: unknown) {
      const browserMessage = browserErr instanceof Error ? browserErr.message : String(browserErr);

      if (browserMessage === "User cancelled") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "cancelled",
                message: "User cancelled the clarifying questions.",
              }),
            },
          ],
          isError: true,
        };
      }

      throw browserErr;
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
}

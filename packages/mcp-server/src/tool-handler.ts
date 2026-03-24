import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { InteractiveClarifyInput, InteractiveClarifyOutput } from "@interactive-clarify/shared";
import { askViaIpc } from "./ipc-client.js";
import { askViaTui } from "./tui/render-tui.js";

/** Thrown when the user explicitly cancels (close tab, Esc, Cancel button). */
class UserCancelledError extends Error {
  constructor(message = "User cancelled") {
    super(message);
    this.name = "UserCancelledError";
  }
}

/**
 * Handle an interactive_clarify tool call.
 *
 * Strategy: try the IPC path first (VS Code extension),
 * and fall back to the built-in Ink TUI only if the IPC connection itself fails.
 * If the user explicitly cancels, return immediately — do NOT fall back to TUI.
 */
export async function handleInteractiveClarify(
  input: InteractiveClarifyInput,
): Promise<CallToolResult> {
  let output: InteractiveClarifyOutput;

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

    // IPC connection failed — fall back to TUI
    try {
      output = await askViaTui(input);
    } catch (tuiErr: unknown) {
      const tuiMessage = tuiErr instanceof Error ? tuiErr.message : String(tuiErr);

      if (tuiMessage === "User cancelled") {
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

      throw tuiErr;
    }
  }

  return {
    content: [{ type: "text", text: JSON.stringify(output) }],
  };
}

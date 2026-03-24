import React from "react";
import { render } from "ink";
import type { InteractiveClarifyInput, InteractiveClarifyOutput } from "@interactive-clarify/shared";
import { App } from "./App.js";

/**
 * Render the Ink-based TUI for interactive clarification.
 *
 * CRITICAL: The MCP server uses stdout for JSON-RPC communication with the
 * AI agent, so the TUI must render exclusively to stderr.
 */
export function askViaTui(input: InteractiveClarifyInput): Promise<InteractiveClarifyOutput> {
  return new Promise<InteractiveClarifyOutput>((resolve, reject) => {
    const instance = render(
      <App
        questions={input.questions}
        onComplete={(output) => {
          instance.unmount();
          resolve(output);
        }}
        onCancel={() => {
          instance.unmount();
          reject(new Error("User cancelled"));
        }}
      />,
      {
        // Render TUI to stderr so stdout stays clear for MCP JSON-RPC
        stdout: process.stderr,
        stdin: process.stdin,
      },
    );
  });
}

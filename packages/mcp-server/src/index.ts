import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TOOL_NAME } from "@interactive-clarify/shared";
import { handleInteractiveClarify } from "./tool-handler.js";
import { readLateResponse } from "./late-response-store.js";

const server = new McpServer({
  name: "interactive-clarify",
  version: "0.1.0",
});

server.tool(
  TOOL_NAME,
  "Present clarifying questions to the user with multiple options. Prefers the VS Code UI when available and falls back to the browser when VS Code is unavailable.",
  {
    questions: z.array(
      z.object({
        id: z.string().optional().describe("Optional stable identifier for this question."),
        question: z.string().describe("Plain-text question prompt shown in the UI."),
        header: z
          .string()
          .max(12)
          .describe('Short tab label, max 12 characters (e.g. "Auth method", "Database").'),
        options: z
          .array(
            z.object({
              label: z.string().describe("Display text for this option (1-5 words)."),
              description: z.string().describe("What this option means or what happens if chosen."),
              preview: z
                .string()
                .optional()
                .describe("Optional preview content shown when focused."),
            }),
          )
          .describe("The available choices (2-4 options)."),
        multiSelect: z
          .boolean()
          .optional()
          .describe("Allow selecting multiple options. Default: false."),
      }),
    ),
  },
  async (input) => {
    return handleInteractiveClarify(input, "auto");
  },
);

server.tool(
  "interactive_clarify_vscode",
  "Present clarifying questions in the VS Code extension UI only. Returns an error instead of falling back to the browser if VS Code is unavailable.",
  {
    questions: z.array(
      z.object({
        id: z.string().optional().describe("Optional stable identifier for this question."),
        question: z.string().describe("Plain-text question prompt shown in the UI."),
        header: z
          .string()
          .max(12)
          .describe('Short tab label, max 12 characters (e.g. "Auth method", "Database").'),
        options: z
          .array(
            z.object({
              label: z.string().describe("Display text for this option (1-5 words)."),
              description: z.string().describe("What this option means or what happens if chosen."),
              preview: z.string().optional().describe("Optional preview content shown when focused."),
            }),
          )
          .describe("The available choices (2-4 options)."),
        multiSelect: z.boolean().optional().describe("Allow multiple selections. Default: false."),
      }),
    ),
  },
  async (input) => {
    return handleInteractiveClarify(input, "vscode");
  },
);

server.tool(
  "interactive_clarify_browser",
  "Present clarifying questions in the browser UI only. Opens a local browser page and does not use the VS Code extension path.",
  {
    questions: z.array(
      z.object({
        id: z.string().optional().describe("Optional stable identifier for this question."),
        question: z.string().describe("Plain-text question prompt shown in the UI."),
        header: z
          .string()
          .max(12)
          .describe('Short tab label, max 12 characters (e.g. "Auth method", "Database").'),
        options: z
          .array(
            z.object({
              label: z.string().describe("Display text for this option (1-5 words)."),
              description: z.string().describe("What this option means or what happens if chosen."),
              preview: z.string().optional().describe("Optional preview content shown when focused."),
            }),
          )
          .describe("The available choices (2-4 options)."),
        multiSelect: z.boolean().optional().describe("Allow multiple selections. Default: false."),
      }),
    ),
  },
  async (input) => {
    return handleInteractiveClarify(input, "browser");
  },
);

server.tool(
  "interactive_clarify_get_late_response",
  "Retrieve a late interactive_clarify response that was saved after the original live MCP request had already timed out or disconnected.",
  {
    requestId: z.string().optional().describe("Optional original interactive_clarify request id. If omitted, returns the latest saved late response."),
  },
  async ({ requestId }) => {
    const record = readLateResponse(requestId);

    if (!record) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: "not_found",
              message: requestId
                ? `No saved late response found for request ${requestId}.`
                : "No saved late responses found.",
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(record) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server fatal error:", err);
  process.exit(1);
});

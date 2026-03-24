import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { TOOL_NAME } from "@interactive-clarify/shared";
import { handleInteractiveClarify } from "./tool-handler.js";

const server = new McpServer({
  name: "interactive-clarify",
  version: "0.1.0",
});

server.tool(
  TOOL_NAME,
  "Present clarifying questions to the user with multiple options. Questions are shown one-by-one in a tab-based interface. Use this when you need user input before proceeding with a task.",
  {
    questions: z.array(
      z.object({
        id: z.string().optional().describe("Optional stable identifier for this question."),
        question: z.string().describe("The full question text (markdown supported)."),
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
                .describe("Optional markdown preview content shown when focused."),
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
    return handleInteractiveClarify(input);
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

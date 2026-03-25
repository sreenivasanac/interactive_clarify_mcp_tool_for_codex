# Interactive Clarify

A universal **"Ask User Questions"** MCP tool for AI coding agents. When an AI agent encounters ambiguity, it can open structured clarifying questions in either a **VS Code webview panel** or a **browser UI**.

Works with **Codex CLI**, **Claude Code**, **Factory Droid**, and any MCP-compatible agent.

## Architecture

```
AI Agent (Codex / Claude Code / Factory Droid)
  │  MCP stdio
  ▼
MCP Server (Node.js)
  │  Auto / VS Code only / Browser only
  ├──→ VS Code Extension ──→ Webview Panel
  └──→ Local Browser Window
  ▼
Returns JSON answers to agent
```

## Features

- **Tab-based navigation** — Questions shown as tabs, with click and keyboard navigation
- **Rich options** — Each option has a label, description, and optional preview content
- **Recommended path** — The first option is visually marked as recommended, with rationale shown in preview
- **Single & multi-select** — Support for both exclusive and multi-choice questions
- **Freeform answer path** — Every question supports a selectable freeform answer
- **Per-answer notes** — Selected structured answers can carry optional notes from the preview panel
- **Partial submit** — Submission is allowed even when not every question is answered
- **Draft restoration** — In-progress answers survive reloads for the same question set
- **Late-submit recovery** — If the live MCP requester times out or disconnects, VS Code can still save the submitted response for later retrieval
- **VS Code themed** — Webview uses native VS Code CSS variables for dark/light theme
- **Browser fallback** — Opens the same React UI in your default browser when VS Code isn't available
- **Universal MCP** — Any MCP-compatible agent can use it

## Available MCP Tools

- `interactive_clarify`
  - default tool
  - prefers VS Code, falls back to browser
- `interactive_clarify_vscode`
  - forces the VS Code extension UI
  - returns an error if VS Code is unavailable
- `interactive_clarify_browser`
  - forces the browser UI
  - shows the local browser URL in the page itself
- `interactive_clarify_get_late_response`
  - retrieves a response saved after the original live MCP request timed out or disconnected

## Project Structure

```
packages/
├── shared/              # Shared types, constants, and IPC protocol
├── mcp-server/          # MCP server (stdio transport) + browser fallback
└── vscode-extension/    # VS Code extension + React webview panel
    └── src/webview/panel/
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- VS Code (optional, for in-editor webview UI)

### 1. Build

```bash
git clone <repo-url>
cd ask-user-questions-tool-interface
pnpm install
pnpm -r build
```

### 2. Configure your AI agent

Pick the agent you use and add the MCP server config (see [Agent Configuration](#agent-configuration) below).

### 3. (Optional) Install VS Code Extension

```bash
cd packages/vscode-extension
pnpm run package          # creates .vsix file
code --install-extension interactive-clarify-vscode-0.1.0.vsix
```

> **Note:** `pnpm run package` uses `vsce` which is included as a devDependency. If you see `vsce: command not found`, make sure you've run `pnpm install` first.
>
> The package script already passes `--no-dependencies` because `vsce` runs `npm list` internally, which conflicts with pnpm workspaces. If you need to run it manually:
> ```bash
> npx @vscode/vsce package --no-dependencies
> ```

The extension activates automatically on VS Code startup and listens for incoming questions on a Unix socket.

### 4. Test it

**Without VS Code (browser UI):**

```bash
# With Codex CLI
codex "Use the interactive_clarify tool to ask me which database I prefer — PostgreSQL, MySQL, or SQLite — before suggesting an implementation"
```

The questions will open in your default browser using the same React UI.

**With VS Code extension installed:**

Run the same command — questions will appear in a VS Code webview panel instead of the browser.

**Smoke test (no agent needed):**

Pipe raw JSON-RPC to the MCP server to verify it works:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2024-11-05"}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"interactive_clarify","arguments":{"questions":[{"question":"Which database should we use?","header":"Database","options":[{"label":"PostgreSQL","description":"Relational DB with extensions"},{"label":"SQLite","description":"Lightweight file-based DB"}],"multiSelect":false}]}}}' | node packages/mcp-server/dist/bin/ask-user-mcp.js
```

This opens the browser fallback so you can verify the tab-based question UI works.

## Agent Configuration

### Codex CLI / Codex App

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.interactive-clarify]
command = "node"
args = ["/absolute/path/to/packages/mcp-server/dist/bin/ask-user-mcp.js"]
```

> **Tip:** This config file is shared between Codex CLI and the Codex VS Code extension (Codex App). Configuring it once makes the tool available in both.

To instruct Codex to use the tool proactively, add to your system prompt or project instructions:

```
When you encounter ambiguous requirements or have clarifying questions,
use the interactive_clarify tool to ask the user before proceeding.
```

### Claude Code

Add to `.mcp.json` (project-scoped, committed to git) or `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "interactive-clarify": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp-server/dist/bin/ask-user-mcp.js"]
    }
  }
}
```

Or via CLI:

```bash
claude mcp add interactive-clarify node /absolute/path/to/packages/mcp-server/dist/bin/ask-user-mcp.js
```

> **Note:** Claude Code already has a built-in `AskUserQuestion` tool. The `interactive_clarify` tool name avoids any conflict. Both tools can coexist — Claude will use whichever is more appropriate.

### Factory Droid

In an active Droid session:

```
/mcp add interactive-clarify node /absolute/path/to/packages/mcp-server/dist/bin/ask-user-mcp.js
```

> **Note:** Factory Droid also has a built-in `ask_user` tool. The `interactive_clarify` name avoids conflicts.

### Generic MCP Client

Any MCP-compatible client using stdio transport:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/packages/mcp-server/dist/bin/ask-user-mcp.js"]
}
```

If you install the server package globally or invoke package binaries directly, the published bin name is `interactive-clarify-mcp`.

## Reference

Detailed reference is in [docs/reference.md](/Users/sreenivasanac/SoftwareProjects/ask-user-questions-tool-interface/docs/reference.md), including:

- tool schemas
- runtime flow
- troubleshooting
- keyboard behavior and answer semantics
- package responsibilities and development entry points

## Environment Variables

| Variable | Description |
|---|---|
| `INTERACTIVE_CLARIFY_SOCKET` | Override the default IPC socket path. Default: `~/.interactive-clarify/interactive-clarify.sock` |

## Development

```bash
# Watch mode for all packages
pnpm dev

# Rebuild everything
pnpm -r build

# Run the MCP server directly
pnpm --filter @interactive-clarify/mcp-server start

# Package VS Code extension
cd packages/vscode-extension
pnpm run package
```

## License

MIT

# Interactive Clarify

A universal **"Ask User Questions"** MCP tool for AI coding agents. When an AI agent encounters ambiguity, it calls the `interactive_clarify` tool to present structured clarifying questions with multiple options — rendered either in a **VS Code webview panel** or a **terminal TUI** fallback.

Works with **Codex CLI**, **Claude Code**, **Factory Droid**, and any MCP-compatible agent.

## Architecture

```
AI Agent (Codex / Claude Code / Factory Droid)
  │  MCP stdio
  ▼
MCP Server (Node.js)
  │  Tries Unix socket IPC ──→ VS Code Extension ──→ Webview Panel
  │  Falls back to ──→ Terminal TUI (Ink, renders to stderr)
  ▼
Returns JSON answers to agent
```

## Features

- **Tab-based navigation** — Questions shown as tabs, navigate with click or keyboard
- **Rich options** — Each option has a label, description, and optional markdown preview
- **Single & multi-select** — Support for both exclusive and multi-choice questions
- **VS Code themed** — Webview uses native VS Code CSS variables for dark/light theme
- **Terminal fallback** — Ink-based TUI renders to stderr when VS Code isn't available
- **Universal MCP** — Any MCP-compatible agent can use it

## Project Structure

```
packages/
├── shared/              # Shared types & IPC protocol
├── mcp-server/          # MCP server (stdio transport)
│   └── src/tui/         # Ink terminal fallback
└── vscode-extension/    # VS Code extension + React webview
    └── src/webview/panel/
```

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 9+
- VS Code (optional, for webview UI — terminal TUI works without it)

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
> The `--no-dependencies` flag is used automatically because `vsce` runs `npm list` internally, which conflicts with pnpm workspaces. If packaging fails with npm dependency errors, run manually:
> ```bash
> npx @vscode/vsce package --no-dependencies --allow-missing-repository
> ```

The extension activates automatically on VS Code startup and listens for incoming questions on a Unix socket.

### 4. Test it

**Without VS Code (terminal TUI):**

```bash
# With Codex CLI
codex "Use the interactive_clarify tool to ask me which database I prefer — PostgreSQL, MySQL, or SQLite — before suggesting an implementation"
```

The questions will render as an interactive TUI directly in your terminal (on stderr).

**With VS Code extension installed:**

Run the same command — questions will appear in a VS Code webview panel instead of the terminal.

**Smoke test (no agent needed):**

Pipe raw JSON-RPC to the MCP server to verify it works:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"},"protocolVersion":"2024-11-05"}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"interactive_clarify","arguments":{"questions":[{"question":"Which database should we use?","header":"Database","options":[{"label":"PostgreSQL","description":"Relational DB with extensions"},{"label":"SQLite","description":"Lightweight file-based DB"}],"multiSelect":false}]}}}' | node packages/mcp-server/dist/bin/ask-user-mcp.js
```

This triggers the terminal TUI so you can verify the tab-based question UI works.

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

## Tool Schema

The `interactive_clarify` tool accepts:

```typescript
{
  questions: Array<{
    question: string;       // Full question text (markdown supported)
    header: string;         // Short tab label (max 12 chars)
    options: Array<{
      label: string;        // Option display text (1-5 words)
      description: string;  // What this option means
      preview?: string;     // Optional markdown preview content
    }>;
    multiSelect?: boolean;  // Allow multiple selections (default: false)
  }>;
}
```

Returns:

```typescript
{
  answers: Record<string, string | string[]>;  // header → selected answer(s)
  annotations?: Record<string, { notes?: string }>;
}
```

## How It Works

1. Agent calls `interactive_clarify` MCP tool with questions
2. MCP server tries to connect to VS Code extension via Unix socket IPC (`~/.interactive-clarify/ipc.sock`)
3. **If VS Code is running** (with extension installed): Extension opens a webview panel with tab-based question UI. User answers, responses flow back via IPC.
4. **If VS Code is unavailable**: MCP server renders an Ink-based terminal TUI on stderr. (stdout is reserved for MCP JSON-RPC — the TUI intentionally renders to stderr to avoid corrupting the protocol stream.)
5. MCP server returns JSON answers to the agent, which continues execution with the user's choices.

## Environment Variables

| Variable | Description |
|---|---|
| `INTERACTIVE_CLARIFY_SOCKET` | Override the default IPC socket path (`~/.interactive-clarify/ipc.sock`) |

## Troubleshooting

### `vsce: command not found` when packaging

Run `pnpm install` in the `packages/vscode-extension` directory first, or use `npx @vscode/vsce package --no-dependencies --allow-missing-repository`.

### VS Code extension not receiving questions

- Check that the extension is activated: open VS Code's Output panel and look for "Interactive Clarify" logs.
- Ensure no stale socket file exists: `rm ~/.interactive-clarify/ipc.sock` and restart VS Code.
- If multiple VS Code windows are open, only the first one binds the socket.

### Terminal TUI not rendering

- The TUI renders to **stderr**, not stdout. If piping output, make sure stderr is visible.
- In Codex CLI's "Full Auto" mode, stderr may be suppressed — use "Suggest" or "Auto-edit" mode instead.

### Agent doesn't use the tool

- Verify the MCP server is listed: run `codex mcp list` / `claude mcp list` / `/mcp` in Factory.
- Add a system prompt instruction telling the agent to use `interactive_clarify` for clarifying questions.
- The agent decides when to use the tool — you can explicitly ask it to: _"Use interactive_clarify to ask me about X before proceeding."_

## Development

```bash
# Watch mode for all packages
pnpm dev

# Rebuild everything
pnpm -r build

# Package VS Code extension
cd packages/vscode-extension
pnpm run package
```

## License

MIT

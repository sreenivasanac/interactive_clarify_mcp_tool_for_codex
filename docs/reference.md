# Interactive Clarify Reference

This file contains the detailed reference material moved out of the main README:

- tool schemas
- runtime flow
- troubleshooting
- package responsibilities
- keyboard behavior and answer semantics

## Tool Schema

### `interactive_clarify`

Prefers the VS Code UI when available and falls back to the browser when VS Code is unavailable.

Accepts:

```typescript
{
  questions: Array<{
    id?: string;            // Optional stable identifier for this question
    question: string;       // Plain-text question prompt shown in the UI
    header: string;         // Short tab label (max 12 chars)
    options: Array<{
      label: string;        // Option display text (1-5 words)
      description: string;  // What this option means
      preview?: string;     // Optional preview content
    }>;
    multiSelect?: boolean;  // Allow multiple selections (default: false)
  }>;
}
```

Returns:

```typescript
{
  answers: Record<string, string | string[]>;
  answerItems?: Array<{
    id?: string;
    header: string;
    answer: string | string[];
  }>;
  annotations?: Record<string, {
    notes?: string;
    optionNotes?: Record<string, string>;
  }>;
}
```

Behavior notes:

- `answers` is the legacy header-keyed output map.
- `answerItems` preserves question order and stable `id` values when provided.
- Unanswered questions are returned as `"Question not answered"` on submit.
- Freeform answers are returned as normal string answers for that question.
- Optional notes for selected structured answers are returned under `annotations[*].optionNotes`.
- The first option is treated as the recommended path in the current UI.

### `interactive_clarify_vscode`

Uses the VS Code extension UI only.

- If VS Code is unavailable, this tool returns an error.
- It does not fall back to the browser.

Input schema is the same as `interactive_clarify`.

### `interactive_clarify_browser`

Uses the browser UI only.

- It bypasses the VS Code extension path.
- The browser page shows the local render URL at the top.

Input schema is the same as `interactive_clarify`.

### `interactive_clarify_get_late_response`

Retrieves a saved late response written by the VS Code extension after the original live MCP request had already timed out or disconnected.

Accepts:

```typescript
{
  requestId?: string; // optional original interactive_clarify request id
}
```

Returns the saved late response record, including:

```typescript
{
  requestId: string;
  createdAt: string;
  questions: QuestionItem[];
  answers: Record<string, string | string[]>;
  answerItems?: Array<{
    id?: string;
    header: string;
    answer: string | string[];
  }>;
  annotations?: Record<string, {
    notes?: string;
    optionNotes?: Record<string, string>;
  }>;
}
```

## How It Works

### Default flow

1. Agent calls `interactive_clarify` with questions.
2. MCP server tries to connect to the VS Code extension via Unix socket IPC.
3. If VS Code is running with the extension installed, the extension opens a webview panel.
4. If VS Code is unavailable and the caller used `interactive_clarify`, the MCP server falls back to a local browser window.
5. Answers are returned to the agent as JSON.

### Explicit-surface flow

- `interactive_clarify_vscode`: force VS Code only
- `interactive_clarify_browser`: force browser only

### Late-submit flow

1. If the upstream MCP caller times out or disconnects while the VS Code panel is still open, the panel switches into a subtle late-submit mode.
2. The user can still submit from VS Code.
3. The extension saves the submitted response to a local file instead of losing it.
4. The coding agent / CLI can later retrieve that saved response using `interactive_clarify_get_late_response`.

Late responses are stored under:

```text
~/.interactive-clarify/late-responses/<requestId>.json
```

File persistence is only used for late submit after disconnect/timeout, not for normal successful live responses.

## UI Behavior

### Keyboard behavior

- `Left` / `Right`: switch questions
- `Up` / `Down`: move between options in the current question
- `Enter`: submit when focus is not inside another text input control
- `N`: open the optional note editor for the currently selected structured option
- `Esc`: open cancel confirmation
- `Tab` / `Shift+Tab`: move focus through interactive controls

### Answer semantics

- A question answer is either:
  - one or more selected options, or
  - a freeform typed answer for that same question
- Freeform answers are question-scoped. They are not stored as a separate global text field.
- Freeform answers do not carry a separate optional note field.
- Structured selected options can carry an additional note, stored in `annotations.optionNotes`.

## Package Responsibilities

### `packages/shared`

Shared contracts used by both the MCP server and the VS Code extension:

- question and answer types
- response timeout and IPC constants
- IPC protocol messages
- stable question key generation

### `packages/mcp-server`

The stdio MCP server layer:

- registers all four MCP tools
- decides whether to use VS Code IPC or browser fallback
- serves the browser UI when needed
- exposes late-response retrieval

Runtime details:

- package name: `@interactive-clarify/mcp-server`
- published bin name: `interactive-clarify-mcp`
- local dev entrypoint: `dist/bin/ask-user-mcp.js`

### `packages/vscode-extension`

The VS Code integration layer:

- binds the local IPC socket
- opens and manages the webview panel
- handles late-submit persistence
- builds the React webview bundle used by both VS Code and browser fallback

Operational notes:

- extension commands:
  - `interactiveClarify.showPanel`
  - `interactiveClarify.showOutput`
  - `interactiveClarify.openLateResponsesFolder`
- activation:
  - `onStartupFinished`
  - `onCommand:interactiveClarify.showPanel`
  - `onCommand:interactiveClarify.showOutput`
  - `onCommand:interactiveClarify.openLateResponsesFolder`
- browser fallback reuses `webview-dist/panel.js` and `panel.css`

## Troubleshooting

### `vsce: command not found` when packaging

Run `pnpm install` in `packages/vscode-extension`, or use:

```bash
npx @vscode/vsce package --no-dependencies --allow-missing-repository
```

### VS Code extension not receiving questions

- Check that the extension is activated: open VS Code's Output panel and look for `Interactive Clarify` logs.
- Ensure no stale socket file exists: `rm ~/.interactive-clarify/interactive-clarify.sock` and restart VS Code.
- If multiple VS Code windows are open, only the first one binds the socket.

### Browser fallback not opening

- Ensure your system can open local URLs via `open` (macOS), `xdg-open` (Linux), or `start` (Windows).
- Make sure `packages/vscode-extension/webview-dist/panel.js` and `panel.css` exist by running `pnpm -r build`.

### MCP call times out before the user finishes answering

- The most common cause is an upstream MCP client timeout outside this repo.
- The internal response timeout is `20 minutes`, but some clients stop waiting earlier.
- The VS Code path supports late submit recovery:
  - if the live requester is gone, the panel still allows submit
  - the response is saved under `~/.interactive-clarify/late-responses/<requestId>.json`
  - retrieve it later with `interactive_clarify_get_late_response`

### Agent doesn't use the tool

- Verify the MCP server is listed: run `codex mcp list` / `claude mcp list` / `/mcp` in Factory.
- Add a system prompt instruction telling the agent to use `interactive_clarify` for clarifying questions.
- The agent decides when to use the tool. You can explicitly ask it to use one of:
  - `interactive_clarify`
  - `interactive_clarify_vscode`
  - `interactive_clarify_browser`

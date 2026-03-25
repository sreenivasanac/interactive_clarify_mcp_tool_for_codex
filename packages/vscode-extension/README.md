# Interactive Clarify

Structured clarifying-question UI for AI coding agents that use the Model Context Protocol (MCP).

Interactive Clarify solves a specific gap in agentic development workflows: coding agents often need a decision from the user before they should proceed, but plain terminal prompts are a poor fit for multiple related questions, side-by-side options, previews, partial answers, and timeout recovery. This extension adds a local VS Code panel so those clarifications can happen in the editor instead of getting reduced to raw JSON or ad hoc chat.

## Why Install It

- Ask and answer structured clarifying questions inside VS Code instead of switching to a browser or terminal prompt.
- Support single-select, multi-select, and freeform answers in the same workflow.
- Show richer context for each choice through descriptions, preview content, and a recommended first option.
- Preserve drafts inside the webview and allow partial submission when not every question is answered yet.
- Recover answers even after the original MCP request timed out or disconnected.
- Keep the transport local: the extension listens on a machine-local IPC socket and does not require a hosted service.

## What Problem It Solves

AI coding agents regularly reach points where they should stop and ask before continuing:

- Which authentication approach should we use?
- Which database should this feature target?
- Should this refactor optimize for speed, safety, or backwards compatibility?
- Which deployment path or environment is intended?

Most agent UIs handle those questions as plain chat or one-off terminal prompts. That breaks down when there are multiple decisions, previews, notes, or follow-up clarifications. Interactive Clarify gives MCP-based agents a dedicated question surface designed for real implementation decisions.

## What This Extension Includes

This Marketplace extension is the VS Code frontend of the Interactive Clarify system.

- It starts with VS Code and listens for local MCP question requests over IPC.
- It opens a React-based webview panel when an agent calls the clarifying-question tool.
- It reuses the same question UI that the companion MCP server can also render in a browser when VS Code is unavailable.
- It stores late responses locally so the agent can fetch them after a disconnect or timeout.

This means the extension is useful when you want the clarification experience inside VS Code, while still keeping browser fallback available from the same overall toolchain.

## Available MCP Tools

- `interactive_clarify`: default tool; prefers the VS Code panel and falls back to the browser when VS Code is unavailable.
- `interactive_clarify_vscode`: forces the VS Code extension UI and returns an error instead of falling back.
- `interactive_clarify_browser`: forces the browser UI and bypasses the VS Code path.
- `interactive_clarify_get_late_response`: retrieves a locally saved response after the original live request timed out or disconnected.

## VS Code Experience

- Tabbed multi-question layout with short headers for fast switching.
- Keyboard navigation for tabs, options, submit, and cancel.
- Optional preview content for focused options.
- Optional per-option notes for structured selections.
- Timeout warning before the request expires.
- Late-submit mode when the live requester is gone but the user still wants to finish answering.
- Output channel logging for IPC startup and request flow.

## Commands

- `Interactive Clarify: Show Questions Panel`
- `Interactive Clarify: Show Output Log`
- `Interactive Clarify: Open Late Responses Folder`

## Who Should Install It

Install this extension if you already use an MCP-capable coding agent such as Codex, Claude Code, Factory Droid, or a custom internal agent and you want user clarifications to happen inside VS Code.

If you want a standalone questionnaire tool without MCP integration, this extension is not the main value. The core benefit is the bridge between coding agents and a richer local clarification UI.

## Setup

This extension is one half of the system. You also need the companion MCP server from the repository below so your agent can call the tools.

- Setup and agent configuration: [GitHub README](https://github.com/sreenivasanac/interactive_clarify_mcp_tool_for_codex#readme)
- Tool and runtime reference: [Reference docs](https://github.com/sreenivasanac/interactive_clarify_mcp_tool_for_codex/blob/main/docs/reference.md)

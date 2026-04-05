# Claude File History — Internal Documentation

## Architecture

This is a monorepo with 4 packages:

```
packages/
├── shared/       # Types, SQLite (sql.js) schema/CRUD, path normalization, constants
├── hooks/        # Claude Code hook scripts (SessionStart + PostToolUse), bundled with esbuild
├── backfill/     # Historical JSONL session scanner, also usable as CLI
└── extension/    # VS Code extension (sidebar TreeView, commands, hook installer)
```

Plus `scripts/install-hooks.js` for standalone hook installation.

## How it works

### Data flow: Real-time (hooks)

1. Claude Code executes a tool (Read, Edit, Write, etc.)
2. PostToolUse hook fires — receives JSON on stdin with `session_id`, `tool_name`, `tool_input`, `tool_use_id`, `cwd`
3. `post-tool-use.js` extracts file paths from `tool_input.file_path`
4. Appends to `~/.claude-file-history/events.jsonl` (append-only backup)
5. Inserts into SQLite: `events` table + upserts `file_index` table
6. Saves DB to disk

### Data flow: Backfill (historical)

1. Scanner lists `~/.claude/projects/*/*.jsonl` files
2. For each file, checks `backfill_state` table — skips if file size hasn't changed
3. Reads line by line, parses JSON
4. For `type === "assistant"` lines, extracts `tool_use` blocks from `message.content[]`
5. Extracts file paths from explicit tools (Read/Edit/Write/MultiEdit)
6. Also extracts user prompts from `type === "user"` lines for conversation previews
7. Batch inserts events, upserts sessions with summary and prompts
8. Updates `backfill_state` with current file size

### Data flow: VS Code extension

1. On activation: opens DB, registers TreeView, installs hooks if needed, runs auto-backfill
2. Watches `~/.claude/projects/**/*.jsonl` for changes, triggers debounced re-backfill
3. On active editor change: queries `file_index` for current file, refreshes sidebar
4. Double-click session: opens terminal with `claude --resume <session-id>`

## Database schema

Located at `~/.claude-file-history/index.db` (SQLite via sql.js WASM).

```sql
sessions (session_id PK, project_root, git_branch, started_at, last_seen_at, source, model, transcript_path, summary, user_prompts)
events (event_id PK, session_id FK, timestamp, project_root, file_path, tool_name, tool_use_id, git_branch, git_sha, confidence, source)
file_index (file_path + session_id PK, first_seen, last_seen, tool_names JSON, event_count, confidence)
backfill_state (jsonl_path PK, last_offset, completed)
```

- `file_index` is denormalized for fast lookups — upserted on every event insert
- `backfill_state.last_offset` stores file size to detect session file growth
- `user_prompts` is a JSON array of up to 50 cleaned user prompt strings
- `summary` is the first substantive (>20 chars) user prompt

## Claude session JSONL format

Files at `~/.claude/projects/<encoded-project-dir>/<session-uuid>.jsonl`. Each line is JSON:

- `type: "user"` — user messages. `message.content` is a string (prompt) or array (tool_result — skip these)
- `type: "assistant"` — assistant responses. `message.content[]` contains `{type: "tool_use", name, input, id}` blocks
- `type: "permission-mode"`, `type: "attachment"`, `type: "file-history-snapshot"` — metadata, ignored

Top-level fields on each line: `sessionId`, `timestamp`, `cwd`, `gitBranch`, `version`, `uuid`, `parentUuid`

Project dir encoding: `-workspaces-claude-file-history` = `/workspaces/claude-file-history` (replace `-` with `/`). This is ambiguous for paths with hyphens, so `cwd` from JSONL records is used as authoritative project root.

## Hook configuration

Hooks are installed in `~/.claude/settings.json` (user-level, not project-level):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node \"~/.claude-file-history/hooks/session-start.js\"", "timeout": 5 }] }],
    "PostToolUse": [{ "matcher": "Read|Edit|Write|MultiEdit|Bash|Glob|Grep|NotebookEdit", "hooks": [{ "type": "command", "command": "node \"~/.claude-file-history/hooks/post-tool-use.js\"", "timeout": 5 }] }]
  }
}
```

Hook scripts are bundled with esbuild and copied to `~/.claude-file-history/hooks/` by the extension on activation. The `sql-wasm.wasm` file must be alongside the hook scripts.

Hooks receive JSON on stdin. Exit 0 = success. Exit 2 = block (with reason on stderr). Any other exit = non-blocking error.

## Build system

- `packages/shared` and `packages/backfill` compile with `tsc`
- `packages/hooks` bundles with esbuild (two entry points -> two standalone JS files)
- `packages/extension` bundles with esbuild (single entry point, externals: `vscode`)
- Extension build copies hook dist files into `dist/hooks/` so they can be installed from the extension
- `sql.js` WASM file is copied alongside bundles (needed at runtime)

## Building

```bash
npm install
npm run build          # builds all workspaces
```

Individual packages:
```bash
npm run build -w @claude-file-history/shared
npm run build -w @claude-file-history/hooks
npm run build -w @claude-file-history/backfill
npm run build -w claude-file-history  # the extension
```

## Packaging and publishing

```bash
cd packages/extension
npx @vscode/vsce package --no-dependencies  # produces .vsix
```

CI/CD: Every push to `main` triggers `.github/workflows/publish.yml` which builds the extension and creates a GitHub release with the `.vsix` attached (tag based on version in `packages/extension/package.json`). If the release already exists, it updates the attachment.

To publish to VS Code Marketplace: download `.vsix` from the release, drag-drop at https://marketplace.visualstudio.com/manage (publisher: `albinstman`).

Optional automation: add `VSCE_PAT` secret + `ENABLE_VSCE_PUBLISH=true` repo variable, or `OVSX_PAT` + `ENABLE_OVSX_PUBLISH=true` for Open VSX.

## Key files

- `packages/shared/src/db.ts` — SQLite schema, all CRUD operations, migration logic
- `packages/shared/src/types.ts` — TypeScript interfaces for events, sessions, hook inputs
- `packages/hooks/src/post-tool-use.ts` — Real-time hook handler (must be fast, <500ms)
- `packages/hooks/src/extract.ts` — File path extraction from tool inputs
- `packages/backfill/src/scanner.ts` — Session file discovery and orchestration
- `packages/backfill/src/parser.ts` — JSONL line parsing, user prompt extraction and cleaning
- `packages/extension/src/extension.ts` — VS Code activation, hook installation, auto-backfill
- `packages/extension/src/providers/session-tree.ts` — TreeDataProvider for the sidebar

## Phase 2 (not yet implemented)

- Bash command parsing for inferred file references
- Glob/Grep tool-results file parsing
- Subagent JSONL scanning (`<session-id>/subagents/agent-*.jsonl`)
- Git SHA capture in hooks
- Session detail webview with full timeline
- "Open in Claude" deep links

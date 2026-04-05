# Claude File History

A VS Code extension that tracks which Claude Code sessions touched each file in your project. Right-click any file or use the sidebar to see session history, tools used, timestamps, and confidence levels.

## How it works

**Real-time logging** — Claude Code hooks (SessionStart + PostToolUse) capture file touches as they happen, recording the session ID, file path, tool name, git branch, and timestamp.

**Historical backfill** — A scanner reads Claude's session JSONL files (`~/.claude/projects/`) and indexes all past file-related tool events.

**VS Code UI** — A sidebar TreeView and right-click context menu show which sessions touched the current file, with details like tools used and whether the touch was explicit (Read/Edit/Write) or inferred (Bash/Glob/Grep).

## Install

### From GitHub Release (recommended)

1. Go to the [Releases](../../releases) page
2. Download the `.vsix` file
3. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..." → select the file

Or from the command line:

```bash
code --install-extension claude-file-history-0.1.0.vsix
```

### From source

```bash
git clone <this-repo>
cd claude-file-history
npm install
npm run build
cd packages/extension
npx @vscode/vsce package --no-dependencies
code --install-extension claude-file-history-0.1.0.vsix
```

## Setup

The extension automatically installs Claude Code hooks on first activation. You can verify by checking `~/.claude/settings.json` — you should see `SessionStart` and `PostToolUse` hook entries.

### Backfill historical sessions

Open the command palette (`Ctrl+Shift+P`) and run:

> **Claude File History: Backfill from Historical Sessions**

This scans `~/.claude/projects/` for past session data and indexes all file touches.

## Usage

- **Sidebar** — Click the clock icon in the activity bar. The sidebar automatically shows sessions for the currently open file.
- **Right-click** — Right-click any file in the explorer or editor → "Show Claude Sessions for This File"
- **Session details** — Expand a session to see individual tool events with timestamps.

### Confidence levels

| Level | Icon | Meaning |
|-------|------|---------|
| Explicit | checkmark | File was a direct argument to Read, Edit, Write, or MultiEdit |
| Inferred | question mark | File appeared in Bash commands, Glob results, or Grep output |

## Data storage

All data is stored locally:

- **Database**: `~/.claude-file-history/index.db` (SQLite via sql.js)
- **Event log**: `~/.claude-file-history/events.jsonl` (append-only backup)
- **Hook scripts**: `~/.claude-file-history/hooks/`

No data is sent anywhere. The extension only reads Claude's local session files.

## Commands

| Command | Description |
|---------|-------------|
| Show Claude Sessions for This File | Show sessions for the selected file |
| Claude File History: Backfill from Historical Sessions | Index all past session data |
| Claude File History: Refresh | Reload the sidebar |
| Claude File History: Reinstall Hooks | Re-register hooks in Claude settings |

## Publishing (for maintainers)

Every push to `main` automatically:

1. Builds the extension
2. Creates a GitHub release (e.g., `v0.1.0`) with the `.vsix` attached — based on the version in `packages/extension/package.json`
3. If a release for that version already exists, updates the `.vsix` attachment

To publish a **new version**: bump `version` in `packages/extension/package.json`, push to `main`, then download the `.vsix` from the GitHub release and drag-drop upload it at https://marketplace.visualstudio.com/manage.

**Optional automation:**
- To auto-publish to the VS Code Marketplace, add a `VSCE_PAT` secret and set the `ENABLE_VSCE_PUBLISH` repository variable to `true`
- For Open VSX, add an `OVSX_PAT` secret and set `ENABLE_OVSX_PUBLISH` to `true`

## License

MIT

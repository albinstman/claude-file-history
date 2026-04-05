# Claude File History

A VS Code extension that tracks which Claude Code sessions touched each file in your project. Find the right conversation to resume by browsing session history per file — with conversation previews, tools used, timestamps, and one-click resume.

## How it works

**Real-time logging** — Claude Code hooks (SessionStart + PostToolUse) capture file touches as they happen, recording the session ID, file path, tool name, git branch, and timestamp.

**Automatic backfill** — On every VS Code startup, the extension silently scans Claude's session JSONL files (`~/.claude/projects/`) and indexes all past file-related tool events. It watches for new sessions in real-time and only re-scans files that have changed.

**VS Code UI** — A sidebar TreeView and right-click context menu show which sessions touched the current file. Each session displays the first substantive user prompt as a label, so you can quickly identify which conversation you're looking for.

## Install

### From GitHub Release (recommended)

1. Go to the [Releases](../../releases) page
2. Download the `.vsix` file
3. In VS Code: `Ctrl+Shift+P` -> "Extensions: Install from VSIX..." -> select the file

Or from the command line:

```bash
code --install-extension claude-file-history-0.3.0.vsix
```

### From VS Code Marketplace

Search for "Claude File History" in the Extensions panel, or visit the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=albinstman.claude-file-history).

### From source

```bash
git clone https://github.com/albinstman/claude-file-history.git
cd claude-file-history
npm install
npm run build
cd packages/extension
npx @vscode/vsce package --no-dependencies
code --install-extension claude-file-history-0.3.0.vsix
```

## Setup

The extension automatically installs Claude Code hooks on first activation and backfills historical sessions in the background. No manual setup required.

You can verify hooks are installed by checking `~/.claude/settings.json` — you should see `SessionStart` and `PostToolUse` hook entries.

## Usage

### Sidebar

Click the clock icon in the activity bar. The sidebar automatically shows sessions for the currently open file.

Each session displays:
- The first substantive user prompt as the label (e.g., "Build a VS Code extension that...")
- Session ID and timestamp
- Tools used and confidence level

Expand a session to see:
- User prompts from the conversation (for context)
- Individual tool events with timestamps

### Resume a session

- Click the play button on any session to open a terminal and run `claude --resume <session-id>`
- Right-click a session for more options: Resume Session, Copy Session ID, Copy Resume Command

### Right-click menu

Right-click any file in the explorer or editor -> "Show Claude Sessions for This File"

### Backfill

Backfilling happens automatically on startup and when new session files are detected. You can also trigger it manually:

`Ctrl+Shift+P` -> **Claude File History: Backfill from Historical Sessions**

### Confidence levels

| Level | Meaning |
|-------|---------|
| Explicit | File was a direct argument to Read, Edit, Write, or MultiEdit |
| Inferred | File appeared in Bash commands, Glob results, or Grep output |

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
| Resume Session | Open a terminal and resume the selected Claude session |
| Copy Session ID | Copy the session UUID to clipboard |
| Copy Resume Command | Copy `claude --resume <id>` to clipboard |
| Claude File History: Backfill from Historical Sessions | Manually trigger backfill |
| Claude File History: Refresh | Reload the sidebar |
| Claude File History: Reinstall Hooks | Re-register hooks in Claude settings |

## Publishing (for maintainers)

Every push to `main` automatically:

1. Builds the extension
2. Creates a GitHub release (e.g., `v0.3.0`) with the `.vsix` attached — based on the version in `packages/extension/package.json`
3. If a release for that version already exists, updates the `.vsix` attachment

To publish a **new version**: bump `version` in `packages/extension/package.json`, push to `main`, then download the `.vsix` from the GitHub release and drag-drop upload it at https://marketplace.visualstudio.com/manage.

**Optional automation:**
- To auto-publish to the VS Code Marketplace, add a `VSCE_PAT` secret and set the `ENABLE_VSCE_PUBLISH` repository variable to `true`
- For Open VSX, add an `OVSX_PAT` secret and set `ENABLE_OVSX_PUBLISH` to `true`

## License

MIT

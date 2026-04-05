# Claude File History

Scared of closing your Claude conversations?

This VS Code extension tracks every Claude Code session that touched your files. Find any past conversation, preview what was discussed, and resume it with a double-click.

## Install

**VS Code Marketplace**: Search for "Claude File History" in the Extensions panel.

**Manual**: Download the `.vsix` from the [Releases](../../releases) page, then `Ctrl+Shift+P` -> "Extensions: Install from VSIX..."

## Features

### See which sessions touched a file

Click the clock icon in the activity bar to open the sidebar. It automatically shows all Claude sessions related to the file you're viewing.

Each session shows:
- The first user prompt as the label so you can identify the conversation
- Session ID and timestamp
- Expand to preview the conversation prompts

### Resume any session

- **Double-click** a session to resume it in a terminal (`claude --resume <id>`)
- **Right-click** for more options: Resume Session, Copy Session ID, Copy Resume Command
- **Hover** for a play button

### Right-click any file

Right-click a file in the explorer or editor -> "Show Claude Sessions for This File"

### Automatic indexing

The extension indexes your Claude session history automatically:
- Installs Claude Code hooks on first activation to capture new file touches in real-time
- Backfills historical sessions from `~/.claude/projects/` on startup
- Watches for new sessions and re-indexes when files change

No manual setup required.

## Privacy

All data is stored locally on your machine. Nothing is sent anywhere.

- `~/.claude-file-history/index.db` — session index
- `~/.claude-file-history/events.jsonl` — event log
- `~/.claude-file-history/hooks/` — hook scripts

## Commands

| Command | Description |
|---------|-------------|
| Show Claude Sessions for This File | Show sessions for the selected file |
| Resume Session | Resume the selected Claude session in a terminal |
| Copy Session ID | Copy session UUID to clipboard |
| Copy Resume Command | Copy `claude --resume <id>` to clipboard |
| Claude File History: Backfill from Historical Sessions | Manually re-index all sessions |
| Claude File History: Refresh | Reload the sidebar |
| Claude File History: Reinstall Hooks | Re-register hooks in Claude settings |

## Requirements

- [Claude Code](https://claude.ai/download) CLI installed
- VS Code 1.85+

## License

MIT

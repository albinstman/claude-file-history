import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { Database } from '@claude-file-history/shared';
import { openDatabase, saveDatabase, normalizePath, DB_PATH, DB_DIR, CLAUDE_SETTINGS_PATH, CLAUDE_PROJECTS_DIR } from '@claude-file-history/shared';
import { SessionTreeDataProvider, SessionTreeItem } from './providers/session-tree';
import { registerShowSessionsCommand } from './commands/show-sessions';
import { registerBackfillCommand } from './commands/run-backfill';

let db: Database | undefined;
const treeProvider = new SessionTreeDataProvider();

export async function activate(context: vscode.ExtensionContext) {
  // Initialize DB
  try {
    db = await openDatabase(false);
    treeProvider.setDb(db);
  } catch (err) {
    console.warn('Claude File History: Could not open database:', err);
  }

  // Register tree view
  const treeView = vscode.window.createTreeView('claudeFileHistory.sessionTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register commands
  registerShowSessionsCommand(context, treeProvider);
  registerBackfillCommand(context, treeProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.refresh', async () => {
      if (!db) {
        try {
          db = await openDatabase(false);
          treeProvider.setDb(db);
        } catch { /* not available yet */ }
      }
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.installHooks', () => {
      installHooks(context);
    })
  );

  // Resume session in terminal
  function resumeSession(item: SessionTreeItem) {
    const sessionId = item.session.session_id;
    const cwd = item.session.project_root;
    const terminal = vscode.window.createTerminal({
      name: `Claude: ${item.session.summary?.substring(0, 30) || sessionId.substring(0, 8)}`,
      cwd,
    });
    terminal.show();
    terminal.sendText(`claude --resume ${sessionId}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.resumeSession', (item: SessionTreeItem) => {
      resumeSession(item);
    })
  );

  // Double-click to resume: detect two clicks on same session within 500ms
  let lastClickedSession: string | undefined;
  let lastClickTime = 0;

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.onSessionClick', (item: SessionTreeItem) => {
      const now = Date.now();
      if (lastClickedSession === item.session.session_id && now - lastClickTime < 500) {
        resumeSession(item);
        lastClickedSession = undefined;
        lastClickTime = 0;
      } else {
        lastClickedSession = item.session.session_id;
        lastClickTime = now;
      }
    })
  );

  // Copy session ID
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.copySessionId', (item: SessionTreeItem) => {
      vscode.env.clipboard.writeText(item.session.session_id);
      vscode.window.showInformationMessage(`Session ID copied: ${item.session.session_id.substring(0, 8)}...`);
    })
  );

  // Copy resume command
  context.subscriptions.push(
    vscode.commands.registerCommand('claudeFileHistory.copyResumeCommand', (item: SessionTreeItem) => {
      const cmd = `claude --resume ${item.session.session_id}`;
      vscode.env.clipboard.writeText(cmd);
      vscode.window.showInformationMessage('Resume command copied to clipboard');
    })
  );

  // Auto-refresh on active editor change
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor?.document.uri.scheme === 'file') {
        treeProvider.setFilePath(normalizePath(editor.document.uri.fsPath));
      }
    })
  );

  // Watch for DB changes from hook scripts
  try {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(DB_DIR), 'index.db')
    );
    watcher.onDidChange(() => reloadDb());
    watcher.onDidCreate(() => reloadDb());
    context.subscriptions.push(watcher);
  } catch { /* ignore */ }

  // Watch for new session JSONL files and auto-backfill them
  watchForNewSessions(context);

  // Set initial file
  if (vscode.window.activeTextEditor?.document.uri.scheme === 'file') {
    treeProvider.setFilePath(normalizePath(vscode.window.activeTextEditor.document.uri.fsPath));
  }

  // Auto-install hooks on first activation
  installHooksIfNeeded(context);

  // Auto-backfill: run silently in background on every activation
  runAutoBackfill();
}

export function deactivate() {
  if (db) {
    db.close();
    db = undefined;
  }
}

async function reloadDb() {
  try {
    if (db) db.close();
    db = await openDatabase(true);
    treeProvider.setDb(db);
    treeProvider.refresh();
  } catch { /* ignore */ }
}

// --- Auto-backfill ---

async function runAutoBackfill() {
  try {
    const { scanAllSessions } = await import('@claude-file-history/backfill');
    const result = await scanAllSessions();

    if (result.totalEvents > 0) {
      await reloadDb();
    }
  } catch (err) {
    console.warn('Claude File History: Auto-backfill failed:', err);
  }
}

// --- Watch for new session files ---

function watchForNewSessions(context: vscode.ExtensionContext) {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return;

  try {
    // Watch all project directories for new .jsonl files
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(CLAUDE_PROJECTS_DIR), '**/*.jsonl')
    );

    // When a session file is modified (new lines appended), re-backfill it
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedBackfill = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runAutoBackfill(), 5000);
    };

    watcher.onDidChange(debouncedBackfill);
    watcher.onDidCreate(debouncedBackfill);
    context.subscriptions.push(watcher);
  } catch {
    // FileSystemWatcher may not support paths outside workspace
  }
}

// --- Hook installation ---

const HOOKS_INSTALLED_KEY = 'claudeFileHistory.hooksInstalled';

function installHooksIfNeeded(context: vscode.ExtensionContext) {
  const installed = context.globalState.get<string>(HOOKS_INSTALLED_KEY);
  const currentVersion = context.extension.packageJSON.version;

  if (installed === currentVersion) return;

  installHooks(context);
  context.globalState.update(HOOKS_INSTALLED_KEY, currentVersion);
}

function installHooks(context: vscode.ExtensionContext) {
  try {
    // Copy hook scripts to stable location
    const stableHooksDir = path.join(DB_DIR, 'hooks');
    fs.mkdirSync(stableHooksDir, { recursive: true });

    const extHooksDir = path.join(context.extensionPath, 'dist', 'hooks');
    for (const file of ['session-start.js', 'post-tool-use.js']) {
      const src = path.join(extHooksDir, file);
      const dest = path.join(stableHooksDir, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    }

    // Also copy the sql.js WASM file
    const wasmSrc = path.join(context.extensionPath, 'dist', 'hooks', 'sql-wasm.wasm');
    const wasmDest = path.join(stableHooksDir, 'sql-wasm.wasm');
    if (fs.existsSync(wasmSrc)) {
      fs.copyFileSync(wasmSrc, wasmDest);
    }

    // Update Claude settings
    const sessionStartPath = path.join(stableHooksDir, 'session-start.js');
    const postToolUsePath = path.join(stableHooksDir, 'post-tool-use.js');

    let settings: Record<string, unknown> = {};
    if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'));
    }

    if (!settings.hooks || typeof settings.hooks !== 'object') {
      settings.hooks = {};
    }
    const hooks = settings.hooks as Record<string, unknown[]>;

    // SessionStart
    if (!Array.isArray(hooks.SessionStart)) hooks.SessionStart = [];
    hooks.SessionStart = (hooks.SessionStart as unknown[]).filter(
      (h) => !JSON.stringify(h).includes('claude-file-history')
    );
    hooks.SessionStart.push({
      hooks: [{ type: 'command', command: `node "${sessionStartPath}"`, timeout: 5 }],
    });

    // PostToolUse
    if (!Array.isArray(hooks.PostToolUse)) hooks.PostToolUse = [];
    hooks.PostToolUse = (hooks.PostToolUse as unknown[]).filter(
      (h) => !JSON.stringify(h).includes('claude-file-history')
    );
    hooks.PostToolUse.push({
      matcher: 'Read|Edit|Write|MultiEdit|Bash|Glob|Grep|NotebookEdit',
      hooks: [{ type: 'command', command: `node "${postToolUsePath}"`, timeout: 5 }],
    });

    fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

    vscode.window.showInformationMessage('Claude File History: Hooks installed successfully.');
  } catch (err) {
    vscode.window.showErrorMessage(`Claude File History: Failed to install hooks: ${err}`);
  }
}

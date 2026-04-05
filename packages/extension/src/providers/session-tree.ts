import * as vscode from 'vscode';
import type { Database } from '@claude-file-history/shared';
import {
  querySessionsForFile,
  queryEventsForFileSession,
  type SessionResult,
  type EventRecord,
} from '@claude-file-history/shared';

type EventDetail = Pick<EventRecord, 'timestamp' | 'tool_name' | 'tool_use_id' | 'confidence'>;

export class SessionTreeDataProvider implements vscode.TreeDataProvider<SessionTreeItem | EventTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentFilePath: string | undefined;
  private db: Database | undefined;

  setDb(db: Database | undefined): void {
    this.db = db;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setFilePath(filePath: string | undefined): void {
    this.currentFilePath = filePath;
    this.refresh();
  }

  getTreeItem(element: SessionTreeItem | EventTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem | EventTreeItem): (SessionTreeItem | EventTreeItem)[] {
    if (!this.db) return [];

    if (!element) {
      if (!this.currentFilePath) return [];

      const sessions = querySessionsForFile(this.db, this.currentFilePath);
      if (sessions.length === 0) return [];

      return sessions.map((s) => new SessionTreeItem(s, this.currentFilePath!));
    }

    if (element instanceof SessionTreeItem) {
      const items: (EventTreeItem | PromptPreviewItem)[] = [];

      // Show user prompts as preview items
      if (element.session.user_prompts && element.session.user_prompts.length > 0) {
        for (const prompt of element.session.user_prompts) {
          items.push(new PromptPreviewItem(prompt));
        }
      }

      // Show tool events
      const events = queryEventsForFileSession(this.db, element.filePath, element.session.session_id);
      for (const e of events) {
        items.push(new EventTreeItem(e));
      }

      return items;
    }

    return [];
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionResult,
    public readonly filePath: string
  ) {
    // Use the summary (first user prompt) as the primary label
    const summary = session.summary || 'No summary';
    const truncatedSummary = summary.length > 80 ? summary.substring(0, 77) + '...' : summary;

    super(truncatedSummary, vscode.TreeItemCollapsibleState.Collapsed);

    const shortId = session.session_id.substring(0, 8);
    const date = new Date(session.last_seen);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tools = session.tool_names.join(', ');
    const badge = session.confidence === 'explicit' ? 'Explicit' : 'Inferred';

    this.description = `${shortId} · ${dateStr} ${timeStr}`;

    const promptsPreview = session.user_prompts
      ? session.user_prompts.map((p, i) => `${i + 1}. ${p}`).join('\n\n')
      : 'No prompts recorded';

    this.tooltip = new vscode.MarkdownString(
      `**${truncatedSummary}**\n\n` +
      `---\n\n` +
      `**Session:** \`${session.session_id}\`\n\n` +
      `**Resume:** \`claude --resume ${session.session_id}\`\n\n` +
      `**Project:** ${session.project_root}\n\n` +
      `**Branch:** ${session.git_branch || 'unknown'}\n\n` +
      `**Model:** ${session.model || 'unknown'}\n\n` +
      `**Tools:** ${tools} [${badge}]\n\n` +
      `**Events:** ${session.event_count}\n\n` +
      `**Period:** ${session.first_seen} → ${session.last_seen}\n\n` +
      `---\n\n` +
      `**Conversation prompts:**\n\n${promptsPreview}`
    );

    this.iconPath = session.confidence === 'explicit'
      ? new vscode.ThemeIcon('comment-discussion')
      : new vscode.ThemeIcon('question');

    this.contextValue = 'session';
  }
}

class PromptPreviewItem extends vscode.TreeItem {
  constructor(prompt: string) {
    const truncated = prompt.length > 100 ? prompt.substring(0, 97) + '...' : prompt;
    super(truncated, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('comment');
    this.tooltip = prompt;
    this.contextValue = 'promptPreview';
  }
}

class EventTreeItem extends vscode.TreeItem {
  constructor(event: EventDetail) {
    const time = new Date(event.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    super(`${event.tool_name} at ${time}`, vscode.TreeItemCollapsibleState.None);

    const badge = event.confidence === 'explicit' ? 'Explicit' : 'Inferred';
    this.description = badge;
    this.iconPath = getToolIcon(event.tool_name);
    this.tooltip = `Tool: ${event.tool_name}\nTime: ${event.timestamp}\nConfidence: ${badge}`;
    this.contextValue = 'event';
  }
}

function getToolIcon(toolName: string): vscode.ThemeIcon {
  switch (toolName) {
    case 'Read': return new vscode.ThemeIcon('eye');
    case 'Edit': return new vscode.ThemeIcon('edit');
    case 'Write': return new vscode.ThemeIcon('new-file');
    case 'MultiEdit': return new vscode.ThemeIcon('files');
    case 'Bash': return new vscode.ThemeIcon('terminal');
    case 'Glob': return new vscode.ThemeIcon('search');
    case 'Grep': return new vscode.ThemeIcon('search');
    default: return new vscode.ThemeIcon('circle-outline');
  }
}

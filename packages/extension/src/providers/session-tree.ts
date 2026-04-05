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
      const events = queryEventsForFileSession(this.db, element.filePath, element.session.session_id);
      return events.map((e) => new EventTreeItem(e));
    }

    return [];
  }
}

class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionResult,
    public readonly filePath: string
  ) {
    const shortId = session.session_id.substring(0, 8);
    const date = new Date(session.last_seen).toLocaleDateString();
    const time = new Date(session.last_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    super(`${shortId} - ${date} ${time}`, vscode.TreeItemCollapsibleState.Collapsed);

    const tools = session.tool_names.join(', ');
    const badge = session.confidence === 'explicit' ? 'Explicit' : 'Inferred';

    this.description = `${tools} [${badge}]`;
    this.tooltip = new vscode.MarkdownString(
      `**Session:** ${session.session_id}\n\n` +
      `**Project:** ${session.project_root}\n\n` +
      `**Branch:** ${session.git_branch || 'unknown'}\n\n` +
      `**Model:** ${session.model || 'unknown'}\n\n` +
      `**Events:** ${session.event_count}\n\n` +
      `**First seen:** ${session.first_seen}\n\n` +
      `**Last seen:** ${session.last_seen}\n\n` +
      `**Confidence:** ${badge}`
    );
    this.iconPath = session.confidence === 'explicit'
      ? new vscode.ThemeIcon('pass-filled')
      : new vscode.ThemeIcon('question');

    this.contextValue = 'session';
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

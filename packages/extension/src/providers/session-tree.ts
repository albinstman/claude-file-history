import * as vscode from 'vscode';
import type { Database } from '@claude-file-history/shared';
import {
  querySessionsForFile,
  type SessionResult,
} from '@claude-file-history/shared';

export class SessionTreeDataProvider implements vscode.TreeDataProvider<SessionTreeItem | PromptPreviewItem> {
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

  getTreeItem(element: SessionTreeItem | PromptPreviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SessionTreeItem | PromptPreviewItem): (SessionTreeItem | PromptPreviewItem)[] {
    if (!this.db) return [];

    if (!element) {
      if (!this.currentFilePath) return [];

      const sessions = querySessionsForFile(this.db, this.currentFilePath);
      if (sessions.length === 0) return [];

      return sessions.map((s) => new SessionTreeItem(s, this.currentFilePath!));
    }

    if (element instanceof SessionTreeItem) {
      if (element.session.user_prompts && element.session.user_prompts.length > 0) {
        return element.session.user_prompts.map((prompt) => new PromptPreviewItem(prompt));
      }
    }

    return [];
  }
}

export class SessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: SessionResult,
    public readonly filePath: string
  ) {
    const summary = session.summary || 'No summary';
    const truncatedSummary = summary.length > 80 ? summary.substring(0, 77) + '...' : summary;

    super(truncatedSummary, vscode.TreeItemCollapsibleState.Collapsed);

    const shortId = session.session_id.substring(0, 8);
    const date = new Date(session.last_seen);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
      `**Period:** ${session.first_seen} → ${session.last_seen}\n\n` +
      `---\n\n` +
      `**Conversation prompts:**\n\n${promptsPreview}`
    );

    this.iconPath = new vscode.ThemeIcon('comment-discussion', new vscode.ThemeColor('charts.orange'));

    this.command = {
      command: 'claudeFileHistory.onSessionClick',
      title: 'Select Session',
      arguments: [this],
    };

    this.contextValue = 'session';
  }
}

class PromptPreviewItem extends vscode.TreeItem {
  constructor(prompt: string) {
    const truncated = prompt.length > 100 ? prompt.substring(0, 97) + '...' : prompt;
    super(truncated, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('comment', new vscode.ThemeColor('charts.orange'));
    this.tooltip = prompt;
    this.contextValue = 'promptPreview';
  }
}

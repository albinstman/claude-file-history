import * as vscode from 'vscode';
import type { SessionTreeDataProvider } from '../providers/session-tree';
import { normalizePath } from '@claude-file-history/shared';

export function registerShowSessionsCommand(
  context: vscode.ExtensionContext,
  treeProvider: SessionTreeDataProvider
): void {
  const command = vscode.commands.registerCommand(
    'claudeFileHistory.showSessions',
    (uri?: vscode.Uri) => {
      let filePath: string | undefined;

      if (uri) {
        filePath = uri.fsPath;
      } else {
        filePath = vscode.window.activeTextEditor?.document.uri.fsPath;
      }

      if (!filePath) {
        vscode.window.showWarningMessage('No file selected');
        return;
      }

      filePath = normalizePath(filePath);
      treeProvider.setFilePath(filePath);

      // Focus the sidebar
      vscode.commands.executeCommand('claudeFileHistory.sessionTree.focus');
    }
  );

  context.subscriptions.push(command);
}

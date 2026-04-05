import * as vscode from 'vscode';
import type { SessionTreeDataProvider } from '../providers/session-tree';

export function registerBackfillCommand(
  context: vscode.ExtensionContext,
  treeProvider: SessionTreeDataProvider
): void {
  const command = vscode.commands.registerCommand(
    'claudeFileHistory.runBackfill',
    async () => {
      const { scanAllSessions } = await import('@claude-file-history/backfill');

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Claude File History: Backfilling sessions...',
          cancellable: false,
        },
        async (progress) => {
          const result = await scanAllSessions((p) => {
            const pct = p.totalFiles > 0 ? (p.processedFiles / p.totalFiles) * 100 : 0;
            progress.report({
              message: `${p.processedFiles}/${p.totalFiles} files, ${p.totalEvents} events`,
              increment: p.totalFiles > 0 ? (1 / p.totalFiles) * 100 : 0,
            });
          });

          vscode.window.showInformationMessage(
            `Backfill complete: ${result.processedFiles} files, ${result.totalEvents} events indexed.`
          );

          treeProvider.refresh();
        }
      );
    }
  );

  context.subscriptions.push(command);
}

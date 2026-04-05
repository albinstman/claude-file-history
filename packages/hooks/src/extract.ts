import { EXPLICIT_TOOLS } from '@claude-file-history/shared';
import type { FileTouch } from '@claude-file-history/shared';
import { normalizePath } from '@claude-file-history/shared';

/**
 * Extract file paths touched by a tool invocation.
 * MVP: only handles explicit tools (Read/Edit/Write/MultiEdit/NotebookEdit).
 * Phase 2 will add Bash command parsing and Glob/Grep result parsing.
 */
export function extractFilePaths(
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResponse: Record<string, unknown> | undefined,
  cwd: string
): FileTouch[] {
  const results: FileTouch[] = [];

  // Explicit tools: file_path is a direct input field
  if ((EXPLICIT_TOOLS as readonly string[]).includes(toolName)) {
    const filePath = toolInput.file_path as string | undefined;
    if (filePath && typeof filePath === 'string') {
      results.push({
        file_path: normalizePath(filePath, cwd),
        confidence: 'explicit',
      });
    }
  }

  // Phase 2: Bash command parsing
  // Phase 2: Glob/Grep result parsing

  return results;
}

/**
 * Extract file paths from a backfill tool_use block (no tool_response available).
 */
export function extractFilePathsFromBackfill(
  toolName: string,
  toolInput: Record<string, unknown>,
  cwd: string
): FileTouch[] {
  return extractFilePaths(toolName, toolInput, undefined, cwd);
}

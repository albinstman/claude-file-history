import * as path from 'path';
import * as fs from 'fs';

/**
 * Normalize a file path to an absolute, resolved form.
 */
export function normalizePath(filePath: string, cwd?: string): string {
  let resolved = filePath;

  // Resolve relative paths against cwd
  if (!path.isAbsolute(resolved) && cwd) {
    resolved = path.resolve(cwd, resolved);
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(resolved);
  }

  // Normalize path separators and resolve . / ..
  resolved = path.normalize(resolved);

  // Try to resolve symlinks, fall back to normalized path
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // File may not exist (e.g., backfill of deleted files)
  }

  // Remove trailing slash
  if (resolved.length > 1 && resolved.endsWith(path.sep)) {
    resolved = resolved.slice(0, -1);
  }

  return resolved;
}

/**
 * Decode a Claude projects directory name to a filesystem path.
 * e.g., "-workspaces-claude-file-history" -> "/workspaces/claude-file-history"
 *
 * Note: This is ambiguous for paths containing hyphens. Use the cwd field
 * from JSONL records as the authoritative project root when available.
 */
export function decodeProjectDir(dirName: string): string {
  return dirName.replace(/-/g, '/');
}

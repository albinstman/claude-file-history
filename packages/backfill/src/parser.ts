import type { EventRecord, JsonlAssistantRecord, JsonlToolUseBlock } from '@claude-file-history/shared';
import { TRACKED_TOOLS, EXPLICIT_TOOLS } from '@claude-file-history/shared';
import { normalizePath } from '@claude-file-history/shared';

/**
 * Parse a single JSONL line and extract file-touch events.
 * Returns empty array for non-assistant lines or lines without relevant tool use.
 */
export function parseJsonlLine(line: string): EventRecord[] {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return [];
  }

  if (record.type !== 'assistant') return [];

  const assistantRecord = record as unknown as JsonlAssistantRecord;
  const message = assistantRecord.message;
  if (!message?.content || !Array.isArray(message.content)) return [];

  const sessionId = assistantRecord.sessionId;
  const timestamp = assistantRecord.timestamp;
  const cwd = assistantRecord.cwd;
  const gitBranch = assistantRecord.gitBranch;

  if (!sessionId || !timestamp || !cwd) return [];

  const events: EventRecord[] = [];

  for (const block of message.content) {
    if (block.type !== 'tool_use') continue;

    const toolBlock = block as JsonlToolUseBlock;
    if (!(TRACKED_TOOLS as readonly string[]).includes(toolBlock.name)) continue;

    const filePaths = extractFilePathsFromBlock(toolBlock, cwd);
    for (const touch of filePaths) {
      events.push({
        session_id: sessionId,
        timestamp,
        project_root: cwd,
        file_path: touch.filePath,
        tool_name: toolBlock.name,
        tool_use_id: toolBlock.id,
        git_branch: gitBranch,
        confidence: touch.confidence,
        source: 'backfill',
      });
    }
  }

  return events;
}

interface FileTouchResult {
  filePath: string;
  confidence: 'explicit' | 'inferred';
}

function extractFilePathsFromBlock(
  block: JsonlToolUseBlock,
  cwd: string
): FileTouchResult[] {
  const results: FileTouchResult[] = [];
  const input = block.input;

  if ((EXPLICIT_TOOLS as readonly string[]).includes(block.name)) {
    const filePath = input.file_path as string | undefined;
    if (filePath && typeof filePath === 'string') {
      results.push({
        filePath: normalizePath(filePath, cwd),
        confidence: 'explicit',
      });
    }
  }

  // Phase 2: Bash command parsing, Glob/Grep result parsing

  return results;
}

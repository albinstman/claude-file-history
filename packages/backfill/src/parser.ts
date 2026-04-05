import type { EventRecord, JsonlAssistantRecord, JsonlToolUseBlock } from '@claude-file-history/shared';
import { TRACKED_TOOLS, EXPLICIT_TOOLS } from '@claude-file-history/shared';
import { normalizePath } from '@claude-file-history/shared';

/**
 * Extract the user prompt text from a JSONL line.
 * Returns the prompt string if this is a user message with real content, undefined otherwise.
 */
export function parseUserPrompt(line: string): string | undefined {
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (record.type !== 'user') return undefined;

  const message = record.message as { content?: unknown } | undefined;
  if (!message?.content) return undefined;

  // User messages can be a plain string or an array of content blocks (tool_result, etc.)
  if (typeof message.content === 'string' && message.content.trim()) {
    return cleanPrompt(message.content.trim());
  }

  // Skip tool_result arrays — those aren't real user prompts
  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        if ((block as Record<string, unknown>).type === 'tool_result') return undefined;
      }
    }
  }

  return undefined;
}

/**
 * Clean up a user prompt by stripping system tags, ANSI codes, and XML noise.
 */
function cleanPrompt(text: string): string | undefined {
  // Strip XML-like system tags and their content
  let cleaned = text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g, '')
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, '')
    .replace(/<command-name>[\s\S]*?<\/command-name>/g, '')
    .replace(/<command-message>[\s\S]*?<\/command-message>/g, '')
    .replace(/<command-args>[\s\S]*?<\/command-args>/g, '')
    .replace(/<new-diagnostics>[\s\S]*?<\/new-diagnostics>/g, '')
    // Strip ANSI escape codes
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\[[\d;]*m/g, '')
    .trim();

  // Skip if it's now empty or just whitespace/punctuation
  if (!cleaned || cleaned.length < 3) return undefined;

  // Skip if it looks like a slash command with no real content
  if (/^\/\w+\s*$/.test(cleaned)) return undefined;

  return cleaned;
}

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

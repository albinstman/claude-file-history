import * as fs from 'fs';
import { openDatabase, saveDatabase, insertEvent, EVENT_LOG_PATH, DB_DIR, TRACKED_TOOLS } from '@claude-file-history/shared';
import type { PostToolUseInput } from '@claude-file-history/shared';
import { extractFilePaths } from './extract';
import { getGitBranch, getGitSha } from './git-info';

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  const input: PostToolUseInput = JSON.parse(raw);

  if (!(TRACKED_TOOLS as readonly string[]).includes(input.tool_name)) {
    return;
  }

  const fileTouches = extractFilePaths(
    input.tool_name,
    input.tool_input,
    input.tool_response,
    input.cwd
  );

  if (fileTouches.length === 0) {
    return;
  }

  const gitBranch = getGitBranch(input.cwd);
  const gitSha = getGitSha(input.cwd);
  const timestamp = new Date().toISOString();

  // Append to event log
  fs.mkdirSync(DB_DIR, { recursive: true });
  for (const touch of fileTouches) {
    const logEntry = {
      session_id: input.session_id,
      timestamp,
      project_root: input.cwd,
      file_path: touch.file_path,
      tool_name: input.tool_name,
      tool_use_id: input.tool_use_id,
      git_branch: gitBranch,
      git_sha: gitSha,
      confidence: touch.confidence,
    };
    fs.appendFileSync(EVENT_LOG_PATH, JSON.stringify(logEntry) + '\n');
  }

  // Insert into SQLite
  const db = await openDatabase();
  try {
    for (const touch of fileTouches) {
      insertEvent(db, {
        session_id: input.session_id,
        timestamp,
        project_root: input.cwd,
        file_path: touch.file_path,
        tool_name: input.tool_name,
        tool_use_id: input.tool_use_id,
        git_branch: gitBranch,
        git_sha: gitSha,
        confidence: touch.confidence,
        source: 'hook',
      });
    }
    saveDatabase(db);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(0);
});

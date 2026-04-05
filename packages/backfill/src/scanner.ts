import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  CLAUDE_PROJECTS_DIR,
  openDatabase,
  saveDatabase,
  insertEventsBatch,
  upsertSession,
  resetBackfillIfGrown,
  updateBackfillState,
} from '@claude-file-history/shared';
import type { EventRecord, Database } from '@claude-file-history/shared';
import { decodeProjectDir } from '@claude-file-history/shared';
import { parseJsonlLine, parseUserPrompt } from './parser';

export interface BackfillProgress {
  totalFiles: number;
  processedFiles: number;
  totalEvents: number;
  currentFile: string;
}

export type ProgressCallback = (progress: BackfillProgress) => void;

export async function scanAllSessions(onProgress?: ProgressCallback): Promise<BackfillProgress> {
  const db = await openDatabase();
  const progress: BackfillProgress = {
    totalFiles: 0,
    processedFiles: 0,
    totalEvents: 0,
    currentFile: '',
  };

  try {
    const jsonlFiles = discoverJsonlFiles();
    progress.totalFiles = jsonlFiles.length;
    onProgress?.(progress);

    for (const { jsonlPath, fallbackProjectRoot } of jsonlFiles) {
      // Check if file needs scanning (new file, or file has grown)
      let fileSize = 0;
      try {
        fileSize = fs.statSync(jsonlPath).size;
      } catch { continue; }

      const needsScan = resetBackfillIfGrown(db, jsonlPath, fileSize);
      if (!needsScan) {
        progress.processedFiles++;
        onProgress?.(progress);
        continue;
      }

      progress.currentFile = path.basename(jsonlPath);
      onProgress?.(progress);

      const { events, userPrompts, cwd } = await parseSessionFile(jsonlPath);
      const sessionId = path.basename(jsonlPath, '.jsonl');

      // Build summary from the first substantive user prompt (skip short greetings)
      const substantivePrompt = userPrompts.find((p) => p.length > 20) || userPrompts[0];
      const summary = substantivePrompt ? substantivePrompt.substring(0, 200) : undefined;
      // Keep up to 50 prompts for preview
      const promptsPreview = userPrompts.slice(0, 50).map((p) => p.substring(0, 200));

      if (events.length > 0 || userPrompts.length > 0) {
        // Prefer cwd from JSONL records (authoritative), then from events, then decoded dir name (lossy)
        const projectRoot = cwd || (events.length > 0 ? events[0].project_root : null) || fallbackProjectRoot;

        upsertSession(db, {
          session_id: sessionId,
          project_root: projectRoot,
          started_at: events.length > 0 ? events[0].timestamp : new Date().toISOString(),
          source: 'backfill',
          transcript_path: jsonlPath,
          summary,
          user_prompts: promptsPreview.length > 0 ? promptsPreview : undefined,
        });

        for (let i = 0; i < events.length; i += 1000) {
          const batch = events.slice(i, i + 1000);
          insertEventsBatch(db, batch);
        }

        progress.totalEvents += events.length;
      }

      updateBackfillState(db, jsonlPath, fileSize, true);
      progress.processedFiles++;
      onProgress?.(progress);
    }

    saveDatabase(db);
  } finally {
    db.close();
  }

  return progress;
}

interface JsonlFileInfo {
  jsonlPath: string;
  fallbackProjectRoot: string;
}

function discoverJsonlFiles(): JsonlFileInfo[] {
  const files: JsonlFileInfo[] = [];

  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) {
    return files;
  }

  const projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;

    const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir.name);
    const fallbackProjectRoot = decodeProjectDir(projectDir.name);

    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        files.push({
          jsonlPath: path.join(projectPath, entry.name),
          fallbackProjectRoot,
        });
      }
    }
  }

  return files;
}

async function parseSessionFile(jsonlPath: string): Promise<{ events: EventRecord[]; userPrompts: string[]; cwd?: string }> {
  const events: EventRecord[] = [];
  const userPrompts: string[] = [];
  let cwd: string | undefined;

  const stream = fs.createReadStream(jsonlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;

    // Extract cwd from the first JSONL line that has it
    if (!cwd) {
      try {
        const record = JSON.parse(line);
        if (record.cwd && typeof record.cwd === 'string') {
          cwd = record.cwd;
        }
      } catch { /* ignore parse errors */ }
    }

    const prompt = parseUserPrompt(line);
    if (prompt) {
      userPrompts.push(prompt);
    }

    const lineEvents = parseJsonlLine(line);
    events.push(...lineEvents);
  }

  return { events, userPrompts, cwd };
}

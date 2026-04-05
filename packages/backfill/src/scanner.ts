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
import { parseJsonlLine } from './parser';

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

      const events = await parseSessionFile(jsonlPath);

      if (events.length > 0) {
        const projectRoot = events[0].project_root || fallbackProjectRoot;
        const sessionId = path.basename(jsonlPath, '.jsonl');

        upsertSession(db, {
          session_id: sessionId,
          project_root: projectRoot,
          started_at: events[0].timestamp,
          source: 'backfill',
          transcript_path: jsonlPath,
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

async function parseSessionFile(jsonlPath: string): Promise<EventRecord[]> {
  const events: EventRecord[] = [];

  const stream = fs.createReadStream(jsonlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const lineEvents = parseJsonlLine(line);
    events.push(...lineEvents);
  }

  return events;
}

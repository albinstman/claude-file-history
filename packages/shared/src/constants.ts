import * as path from 'path';
import * as os from 'os';

export const DB_DIR = path.join(os.homedir(), '.claude-file-history');
export const DB_PATH = path.join(DB_DIR, 'index.db');
export const EVENT_LOG_PATH = path.join(DB_DIR, 'events.jsonl');
export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

export const EXPLICIT_TOOLS = ['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const;
export const INFERRED_TOOLS = ['Bash', 'Glob', 'Grep'] as const;
export const TRACKED_TOOLS = [...EXPLICIT_TOOLS, ...INFERRED_TOOLS] as const;

export type ExplicitTool = (typeof EXPLICIT_TOOLS)[number];
export type InferredTool = (typeof INFERRED_TOOLS)[number];
export type TrackedTool = (typeof TRACKED_TOOLS)[number];

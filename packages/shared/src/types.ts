export interface EventRecord {
  session_id: string;
  timestamp: string;
  project_root: string;
  file_path: string;
  tool_name: string;
  tool_use_id?: string;
  git_branch?: string;
  git_sha?: string;
  confidence: 'explicit' | 'inferred';
  source: 'hook' | 'backfill';
}

export interface SessionRecord {
  session_id: string;
  project_root: string;
  git_branch?: string;
  started_at: string;
  source: 'hook' | 'backfill';
  model?: string;
  transcript_path?: string;
  summary?: string;
  user_prompts?: string[];
}

export interface SessionResult {
  session_id: string;
  project_root: string;
  first_seen: string;
  last_seen: string;
  tool_names: string[];
  event_count: number;
  confidence: 'explicit' | 'inferred';
  git_branch?: string;
  model?: string;
  transcript_path?: string;
  summary?: string;
  user_prompts?: string[];
}

export interface FileTouch {
  file_path: string;
  confidence: 'explicit' | 'inferred';
}

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  permission_mode?: string;
}

export interface SessionStartInput extends HookInput {
  source: string;
  model: string;
}

export interface PostToolUseInput extends HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id: string;
}

export interface JsonlAssistantRecord {
  type: 'assistant';
  uuid: string;
  timestamp: string;
  parentUuid: string | null;
  isSidechain: boolean;
  agentId?: string;
  message: {
    model: string;
    role: 'assistant';
    content: JsonlContentBlock[];
  };
  sessionId: string;
  cwd: string;
  gitBranch?: string;
  version?: string;
}

export interface JsonlToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type JsonlContentBlock =
  | JsonlToolUseBlock
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string };

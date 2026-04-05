#!/usr/bin/env node

/**
 * Installs Claude File History hooks into ~/.claude/settings.json.
 * Merges hook configuration without overwriting existing hooks.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function getHooksDir() {
  return path.resolve(__dirname, '..', 'packages', 'hooks', 'dist');
}

function main() {
  const hooksDir = getHooksDir();
  const sessionStartScript = path.join(hooksDir, 'session-start.js');
  const postToolUseScript = path.join(hooksDir, 'post-tool-use.js');

  // Verify hook scripts exist
  if (!fs.existsSync(sessionStartScript)) {
    console.error(`Hook script not found: ${sessionStartScript}`);
    console.error('Run "npm run build:hooks" first.');
    process.exit(1);
  }
  if (!fs.existsSync(postToolUseScript)) {
    console.error(`Hook script not found: ${postToolUseScript}`);
    console.error('Run "npm run build:hooks" first.');
    process.exit(1);
  }

  // Read existing settings
  let settings = {};
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
    settings = JSON.parse(raw);
  }

  // Ensure hooks object exists
  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const hooks = settings.hooks;

  // Define our hook entries
  const sessionStartHook = {
    hooks: [
      {
        type: 'command',
        command: `node "${sessionStartScript}"`,
        timeout: 5,
      },
    ],
  };

  const postToolUseHook = {
    matcher: 'Read|Edit|Write|MultiEdit|Bash|Glob|Grep|NotebookEdit',
    hooks: [
      {
        type: 'command',
        command: `node "${postToolUseScript}"`,
        timeout: 5,
      },
    ],
  };

  // Add hooks (append to existing arrays, or create new)
  if (!Array.isArray(hooks.SessionStart)) {
    hooks.SessionStart = [];
  }
  // Remove existing claude-file-history hooks
  hooks.SessionStart = hooks.SessionStart.filter(
    (h) => !JSON.stringify(h).includes('claude-file-history')
  );
  hooks.SessionStart.push(sessionStartHook);

  if (!Array.isArray(hooks.PostToolUse)) {
    hooks.PostToolUse = [];
  }
  hooks.PostToolUse = hooks.PostToolUse.filter(
    (h) => !JSON.stringify(h).includes('claude-file-history')
  );
  hooks.PostToolUse.push(postToolUseHook);

  // Write back
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');

  console.log('Claude File History hooks installed successfully!');
  console.log(`Settings written to: ${CLAUDE_SETTINGS_PATH}`);
  console.log('\nHooks configured:');
  console.log(`  SessionStart -> ${sessionStartScript}`);
  console.log(`  PostToolUse  -> ${postToolUseScript}`);
}

main();

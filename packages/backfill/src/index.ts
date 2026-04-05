#!/usr/bin/env node

import { scanAllSessions, type BackfillProgress } from './scanner';

export { scanAllSessions, type BackfillProgress } from './scanner';
export { parseJsonlLine, parseUserPrompt } from './parser';

async function main() {
  console.log('Claude File History - Backfill Scanner');
  console.log('Scanning ~/.claude/projects/ for session files...\n');

  const result = await scanAllSessions((progress: BackfillProgress) => {
    process.stdout.write(
      `\r[${progress.processedFiles}/${progress.totalFiles}] ` +
      `${progress.totalEvents} events found` +
      (progress.currentFile ? ` - ${progress.currentFile}` : '') +
      '    '
    );
  });

  console.log('\n');
  console.log(`Done! Processed ${result.processedFiles} session files.`);
  console.log(`Total file-touch events indexed: ${result.totalEvents}`);
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

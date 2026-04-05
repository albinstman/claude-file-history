import { openDatabase, saveDatabase, upsertSession } from '@claude-file-history/shared';
import type { SessionStartInput } from '@claude-file-history/shared';

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  const input: SessionStartInput = JSON.parse(raw);

  const db = await openDatabase();
  try {
    upsertSession(db, {
      session_id: input.session_id,
      project_root: input.cwd,
      started_at: new Date().toISOString(),
      source: 'hook',
      model: input.model,
      transcript_path: input.transcript_path,
    });
    saveDatabase(db);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(0);
});

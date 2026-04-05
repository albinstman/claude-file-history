import { execSync } from 'child_process';

export function getGitBranch(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      timeout: 500,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}

export function getGitSha(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd,
      timeout: 500,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
}

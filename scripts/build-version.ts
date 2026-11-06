import { execFileSync } from 'node:child_process';
import type { BuildVersion } from '../src/build-version';

type GitReader = (args: string[]) => string | undefined;
const shaPattern = /^[0-9a-f]{40}$/i;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function githubRepository(origin: string): string | undefined {
  const match = origin
    .trim()
    .match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^?#\s]+)$/);
  const repository = match?.[1].replace(/\.git$/, '');
  return repository &&
    repositoryPattern.test(repository) &&
    !repository.split('/').some((part) => part === '.' || part === '..')
    ? repository
    : undefined;
}

/** Build-time identity, following Waypoint's YYYY.MM.shortSHA[.d] convention. */
export function createBuildVersion({
  cwd = process.cwd(),
  env = process.env,
  now = new Date(),
  git,
}: {
  cwd?: string;
  env?: Record<string, string | undefined>;
  now?: Date;
  git?: GitReader;
} = {}): BuildVersion {
  const readGit: GitReader =
    git ||
    ((args) => {
      try {
        return execFileSync('git', args, {
          cwd,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
      } catch {
        return undefined;
      }
    });
  const configuredSha = (env.GITHUB_SHA || env.COMMIT_SHA || '').trim();
  if (configuredSha && !shaPattern.test(configuredSha))
    throw new Error('Build commit must be a full 40-character Git SHA.');
  const head = readGit(['rev-parse', 'HEAD']);
  const localSha = head && shaPattern.test(head) ? head : undefined;
  if (configuredSha && localSha && configuredSha.toLowerCase() !== localSha.toLowerCase())
    throw new Error('Configured build commit does not match the checked-out Git commit.');
  const fullSha = (configuredSha || localSha)?.toLowerCase() || null;
  const shortSha = fullSha?.slice(0, 7) || null;
  const configuredRepository = env.GITHUB_REPOSITORY?.trim();
  if (
    configuredRepository &&
    (!repositoryPattern.test(configuredRepository) ||
      configuredRepository.split('/').some((part) => part === '.' || part === '..'))
  )
    throw new Error('GITHUB_REPOSITORY must use owner/repository form.');
  const repository = configuredRepository || githubRepository(readGit(['remote', 'get-url', 'origin']) || '');
  const dirty = !!(
    localSha &&
    env.VERSION_ASSUME_CLEAN?.toLowerCase() !== 'true' &&
    readGit(['status', '--porcelain'])
  );
  const yearMonth = `${now.getUTCFullYear()}.${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return {
    displayVersion: shortSha ? `${yearMonth}.${shortSha}${dirty ? '.d' : ''}` : 'Local build',
    fullSha,
    shortSha,
    dirty,
    githubCommitUrl: fullSha && repository ? `https://github.com/${repository}/commit/${fullSha}` : null,
  };
}

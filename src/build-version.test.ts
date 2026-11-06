import { describe, expect, it } from 'vitest';
import { createBuildVersion, githubRepository } from '../scripts/build-version';

const sha = `a123456${'0'.repeat(33)}`;
const now = new Date('2026-11-06T00:00:00Z');
const localGit =
  (dirty = '') =>
  (args: string[]) =>
    (
      ({
        'rev-parse HEAD': sha,
        'remote get-url origin': 'git@github.com:noddson/fatecc.git',
        'status --porcelain': dirty,
      }) as Record<string, string>
    )[args.join(' ')];

describe('build commit identity', () => {
  it('uses Waypoint date and short commit format with the exact full commit link', () => {
    expect(createBuildVersion({ env: {}, now, git: localGit() })).toEqual({
      displayVersion: '2026.11.a123456',
      fullSha: sha,
      shortSha: 'a123456',
      dirty: false,
      githubCommitUrl: `https://github.com/noddson/fatecc/commit/${sha}`,
    });
  });
  it('marks local changes and supports the existing clean-CI override', () => {
    expect(createBuildVersion({ env: {}, now, git: localGit('?? new-file.ts') }).displayVersion).toBe(
      '2026.11.a123456.d',
    );
    expect(
      createBuildVersion({ env: { VERSION_ASSUME_CLEAN: 'true' }, now, git: localGit(' M file') }).dirty,
    ).toBe(false);
  });
  it('accepts explicit CI metadata without requiring a checkout', () => {
    expect(
      createBuildVersion({
        env: { GITHUB_SHA: sha, GITHUB_REPOSITORY: 'noddson/fatecc' },
        now,
        git: () => undefined,
      }).githubCommitUrl,
    ).toBe(`https://github.com/noddson/fatecc/commit/${sha}`);
  });
  it('does not invent a commit or repository for unversioned local builds', () => {
    expect(createBuildVersion({ env: {}, now, git: () => undefined })).toEqual({
      displayVersion: 'Local build',
      fullSha: null,
      shortSha: null,
      dirty: false,
      githubCommitUrl: null,
    });
    expect(
      createBuildVersion({ env: { COMMIT_SHA: sha }, now, git: () => undefined }).githubCommitUrl,
    ).toBeNull();
  });
  it('rejects malformed or mismatched configured commit identity', () => {
    expect(() => createBuildVersion({ env: { GITHUB_SHA: 'main' }, git: () => undefined })).toThrow(
      'full 40-character',
    );
    expect(() => createBuildVersion({ env: { GITHUB_SHA: 'b'.repeat(40) }, git: localGit() })).toThrow(
      'does not match',
    );
    expect(() =>
      createBuildVersion({ env: { GITHUB_REPOSITORY: '../fatecc' }, git: () => undefined }),
    ).toThrow('owner/repository');
  });
  it('only turns supported GitHub remotes into commit destinations', () => {
    expect(githubRepository('https://github.com/noddson/fatecc.git')).toBe('noddson/fatecc');
    expect(githubRepository('ssh://git@github.com/noddson/fatecc.git')).toBe('noddson/fatecc');
    for (const origin of [
      'https://github.com.evil.test/noddson/fatecc',
      'https://secret@github.com/noddson/fatecc',
      'https://github.com/noddson/fatecc?token=secret',
      'https://gitlab.com/noddson/fatecc',
    ])
      expect(githubRepository(origin)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REFERENCE_ENTRIES, REFERENCE_METADATA, campaignReferences, searchReferences } from './reference';
import sourceLock from './source-lock.json';
import { CORE_RULES } from '../domain/defaults';
import readingLinks from './reading-links.json';
import readingHeadings from './reading-headings.json';
import { coreReadingUrl } from './reading-links';
import { coreRuleSource } from '../domain/rule-sources';
import { createCharacter } from '../domain/defaults';
import { validateCharacter } from '../domain/rules';

const sourcePath = 'src/content/source/fate-core-SRD.html';
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

describe('Official offline Core reference library', () => {
  it('includes the original attribution and only the selected Core source', () => {
    expect(REFERENCE_METADATA.repository).toBe('fate-srd/fate-srd-content');
    expect(REFERENCE_METADATA.sourcePath).toBe('source/fate-core-SRD.html');
    expect(REFERENCE_METADATA.revision).toBe(sourceLock.revision);
    expect(REFERENCE_METADATA.attribution).toContain('Creative Commons Attribution 3.0 Unported');
    expect(REFERENCE_METADATA.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(REFERENCE_ENTRIES.length).toBe(REFERENCE_METADATA.entryCount);
    expect(new Set(REFERENCE_ENTRIES.map((e) => e.id)).size).toBe(REFERENCE_ENTRIES.length);
    expect(CORE_RULES.contentVersion).toBe(REFERENCE_METADATA.version);
    for (const entry of REFERENCE_ENTRIES) {
      expect(entry.contentVersion).toBe(REFERENCE_METADATA.version);
      expect(entry.sourceUrl).toBe(`${REFERENCE_METADATA.sourceUrl}#L${entry.sourceLine}`);
      expect(entry.readingUrl).toBe(coreReadingUrl(entry.sourceLine!));
      expect(entry.readingUrl).toMatch(/^https:\/\/fate-srd\.com\/fate-core\/[a-z-]+(?:#.+)?$/);
      expect(entry.sourceSection).toBe(entry.title);
      expect(entry.sourceLine).toBeGreaterThan(0);
    }
  });
  it('uses readable website destinations while preserving the pinned source attribution', () => {
    expect(readingLinks.sourceRevision).toBe(sourceLock.revision);
    const boundaries = readingLinks.sections.map((section) => section.sourceLine);
    expect(boundaries).toEqual([...new Set(boundaries)].sort((a, b) => a - b));
    expect(coreRuleSource('phase-trio').url).toBe('https://fate-srd.com/fate-core/phase-trio');
    expect(coreRuleSource('phase-trio').sourceUrl).toBe(`${REFERENCE_METADATA.sourceUrl}#L748`);
    expect(coreRuleSource('recovery').url).toBe(
      'https://fate-srd.com/fate-core/resolving-attacks#recovering-from-a-consequence',
    );
    const issues = validateCharacter(createCharacter(), CORE_RULES);
    expect(issues.find((issue) => issue.message === 'Describe 3 backstory phases.')?.sourceUrl).toBe(
      'https://fate-srd.com/fate-core/phase-trio',
    );
    expect(issues.every((issue) => issue.sourceUrl?.startsWith(readingLinks.baseUrl))).toBe(true);
    expect(REFERENCE_ENTRIES.find((entry) => entry.title === 'The Phase Trio')?.readingUrl).toBe(
      'https://fate-srd.com/fate-core/phase-trio',
    );
  });
  it('links subsections directly to verified official heading IDs', () => {
    const pages = readingHeadings.pages as Record<string, { level: number; id: string; text: string }[]>;
    const normalize = (title: string) =>
      title
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '');
    for (const entry of REFERENCE_ENTRIES) {
      const url = new URL(entry.readingUrl!);
      const headings = pages[url.pathname.split('/').at(-1)!];
      expect(headings, entry.title).toBeDefined();
      if (url.hash)
        expect(
          headings.map((heading) => heading.id),
          entry.title,
        ).toContain(decodeURIComponent(url.hash.slice(1)));
      const matches = headings.filter((heading) => normalize(heading.text) === normalize(entry.title));
      const anchors = new Set(matches.map((heading) => heading.id));
      if (matches.length && !matches.some((heading) => heading.level === 1) && anchors.size === 1)
        expect(decodeURIComponent(url.hash.slice(1)), entry.title).toBe(matches[0].id);
    }
    for (const [title, path] of [
      ['Balancing Stunt Utility', 'building-stunts#balancing-stunt-utility'],
      ['Stacking Effects', 'building-stunts#stacking-effects'],
      ['Branching Effects', 'building-stunts#branching-effects'],
      ['Contacts Stunts', 'contacts#stunts'],
      ['Phase One: Your Adventure', 'phase-trio#phase-one-your-adventure'],
    ])
      expect(REFERENCE_ENTRIES.find((entry) => entry.title === title)?.readingUrl).toBe(
        readingLinks.baseUrl + path,
      );
    expect(
      execFileSync('python3', ['scripts/audit-reading-links.py', '--check'], { encoding: 'utf8' }),
    ).toContain('Verified');
  });
  it('matches the pinned GitHub blob bytes and generated Markdown checksum', () => {
    const raw = readFileSync(sourcePath);
    expect(sha256(raw)).toBe(sourceLock.selectedSource.sha256);
    expect(raw.length).toBe(sourceLock.selectedSource.bytes);
    const gitSha = createHash('sha1').update(`blob ${raw.length}\0`).update(raw).digest('hex');
    expect(gitSha).toBe(sourceLock.selectedSource.blobSha);
    const markdown = readFileSync(REFERENCE_METADATA.markdownPath);
    expect(sha256(markdown)).toBe(REFERENCE_METADATA.markdownSha256);
    expect(markdown.toString()).toContain(REFERENCE_METADATA.attribution);
    const lines = raw.toString().split('\n');
    for (const entry of REFERENCE_ENTRIES) {
      expect(lines[entry.sourceLine! - 1]).toMatch(/<h[1-6][ >]/);
    }
  });
  it('reproduces references offline and rejects changed source before writing outputs', () => {
    expect(execFileSync('python3', ['scripts/import-srd.py', '--check'], { encoding: 'utf8' })).toContain(
      `Verified ${REFERENCE_METADATA.entryCount} Core references`,
    );
    const checkout = mkdtempSync(join(tmpdir(), 'fate-srd-import-'));
    const generatedPaths = [
      sourcePath,
      REFERENCE_METADATA.markdownPath,
      'src/content/reference.json',
      'src/content/source-metadata.json',
    ];
    const before = generatedPaths.map((path) => sha256(readFileSync(path)));
    try {
      mkdirSync(join(checkout, 'source'));
      writeFileSync(
        join(checkout, REFERENCE_METADATA.sourcePath),
        Buffer.concat([readFileSync(sourcePath), Buffer.from('\nchanged source')]),
      );
      const result = spawnSync('python3', ['scripts/import-srd.py', checkout], { encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Source differs from the pinned GitHub blob');
      expect(generatedPaths.map((path) => sha256(readFileSync(path)))).toEqual(before);
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  });
  it('distributes matching attribution notices and inventories future sources separately', () => {
    const notice = readFileSync('public/LICENSE-SRD.txt', 'utf8');
    expect(notice).toBe(readFileSync('src/content/LICENSE.txt', 'utf8'));
    expect(notice).toContain(REFERENCE_METADATA.attribution);
    expect(notice).toContain(REFERENCE_METADATA.sourceUrl);
    expect(notice).toContain('Changes');
    expect(sourceLock.markdownCatalog).toHaveLength(19);
    expect(sourceLock.markdownCatalog.find((source) => source.path.endsWith('/fate-core.md'))?.status).toBe(
      'not-selected-abridged-ogl',
    );
  });
  it('searches the complete local source with official three-free-stunt wording', () => {
    const results = searchReferences('stunts refresh');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((entry) => entry.sourceUrl?.startsWith(REFERENCE_METADATA.sourceUrl))).toBe(true);
    expect(results.every((entry) => entry.readingUrl?.startsWith(readingLinks.baseUrl))).toBe(true);
    expect(REFERENCE_ENTRIES.some((e) => /three stunts for free/i.test(e.body))).toBe(true);
    expect(searchReferences('consequences').some((e) => /recover/i.test(e.body))).toBe(true);
  });
  it('preserves table rows and removes empty graphic placeholders', () => {
    const ladder = REFERENCE_ENTRIES.find((entry) => entry.title === 'The Ladder')!;
    expect(ladder.body).toContain('+8 | Legendary\n+7 | Epic\n+6 | Fantastic');
    expect(REFERENCE_ENTRIES.find((entry) => entry.title === 'The Default Skill List')!.body).toContain(
      'Skill | Overcome | Create an Advantage | Attack | Defend',
    );
    expect(REFERENCE_ENTRIES.every((entry) => !entry.body.includes('\ufffc'))).toBe(true);
  });
  it('supports categories and campaign-created references', () => {
    expect(searchReferences('', 'Extras').every((e) => e.category === 'Extras')).toBe(true);
    const entries = campaignReferences([
      {
        id: 'moon-magic',
        kind: 'reference',
        title: 'Moon magic',
        body: 'Costs one Fate point.',
        visibility: 'shared',
        tags: ['magic'],
      },
    ]);
    expect(entries[0].source).toBe('Your campaign');
    expect(entries[0].body).toBe('Costs one Fate point.');
    expect(entries[0].readingUrl).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { ACCELERATED_RULES } from '../domain/defaults';
import { ruleSource } from '../domain/rule-sources';
import { campaignReferences, metadataForRules, referenceCategories, referencesForRules } from './reference';
import readingLinks from './accelerated-reading-links.json';
import readingHeadings from './accelerated-reading-headings.json';

const entries = referencesForRules(ACCELERATED_RULES);
const normalize = (title: string) =>
  title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

describe('Accelerated alignment with the Rules library', () => {
  it('uses the same topic names and sidebar order, retaining campaign references and original chapter tags', () => {
    const categories = [
      'About',
      'Basics',
      'Campaigns & advancement',
      'Characters',
      'Aspects & Fate points',
      'Skills & stunts',
      'Actions & outcomes',
      'Challenges & conflicts',
      'Running the game',
    ];
    expect(referenceCategories(entries)).toEqual(categories);
    expect(entries.every((entry) => categories.includes(entry.category))).toBe(true);
    expect(entries.find((entry) => entry.title === 'Approaches')).toMatchObject({
      category: 'Characters',
      tags: ['Who Do You Want To Be?', 'Fate Accelerated'],
    });
    const campaign = campaignReferences([
      {
        id: 'custom',
        kind: 'reference',
        title: 'House rule',
        body: 'Our table agreement.',
        visibility: 'shared',
        tags: [],
      },
    ]);
    expect(referenceCategories([...entries, ...campaign])).toEqual([...categories, 'Campaign references']);
  });

  it('maps every entry to its reviewed page or anchor without replacing its pinned source or content version', () => {
    const metadata = metadataForRules(ACCELERATED_RULES);
    expect(readingLinks.sourceRevision).toBe(metadata.revision);
    expect(readingLinks.verifiedAt).toBe(metadata.readingLinksVerifiedAt);
    const boundaries = readingLinks.sections.map((section) => section.sourceLine);
    expect(boundaries).toEqual([...new Set(boundaries)].sort((a, b) => a - b));
    expect(readingLinks.sections).toHaveLength(entries.length);
    const pages = readingHeadings.pages as Record<string, { level: number; id: string; text: string }[]>;
    for (const entry of entries) {
      const mapping = readingLinks.sections.find((section) => section.sourceLine === entry.sourceLine);
      expect(entry.readingUrl, entry.title).toBe(readingLinks.baseUrl + mapping!.path);
      expect(entry.sourceUrl).toBe(`${metadata.sourceUrl}#L${entry.sourceLine}`);
      expect(entry.contentVersion).toBe(ACCELERATED_RULES.contentVersion);
      const url = new URL(entry.readingUrl!);
      const page = url.pathname.slice(new URL(readingLinks.baseUrl).pathname.length);
      const headings = pages[page];
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
    expect(entries.find((entry) => entry.title === 'Approaches')?.readingUrl).toBe(
      'https://fate-srd.com/fate-accelerated/who-do-you-want-be#approaches',
    );
    // The official action headings lack IDs. The enclosing Actions anchor is verified.
    for (const title of ['Create an Advantage', 'Overcome', 'Attack', 'Defend'])
      expect(entries.find((entry) => entry.title === title)?.readingUrl).toBe(
        'https://fate-srd.com/fate-accelerated/how-do-stuff-outcomes-actions-and-approaches#actions',
      );
    expect(
      execFileSync('python3', ['scripts/audit-reading-links.py', '--edition', 'accelerated', '--check'], {
        encoding: 'utf8',
      }),
    ).toContain('Verified');
  });

  it('opens the section that actually explains boosts and uses anchored help destinations', () => {
    const boosts = entries.find((entry) => entry.title === 'What Kinds of Aspects Are There?')!;
    expect(boosts.body).toMatch(/Boosts:/);
    expect(ruleSource(ACCELERATED_RULES, 'boosts')).toEqual({
      label: 'Accelerated SRD · What Kinds of Aspects Are There?',
      url: 'https://fate-srd.com/fate-accelerated/aspects-fate-points#what-kinds-of-aspects-are-there',
      sourceUrl: boosts.sourceUrl,
    });
    expect(ruleSource(ACCELERATED_RULES, 'skills').url).toBe(
      'https://fate-srd.com/fate-accelerated/who-do-you-want-be#approaches',
    );
    expect(ruleSource(ACCELERATED_RULES, 'harm').url).toBe(
      'https://fate-srd.com/fate-accelerated/ouch-damage-stress-and-consequences#what-is-stress',
    );
  });
});

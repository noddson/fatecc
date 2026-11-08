import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import references from './content/reference.json';
import metadata from './content/source-metadata.json';
import { deriveCharacter, validateCharacter } from './domain/rules';
import { HEARTS_SOURCES, heartsOfSteelCampaign } from './hearts-of-steel';
import { projectCampaign } from './network/projection';
import { exportCampaign, exportCampaignZip, parseCampaignExport } from './storage/backup';
import { assertReferences, campaignSchema } from './storage/schema';

describe('Hearts of Steel SRD starter', () => {
  it('anchors the provenance register and retained aspect/stunt names to the pinned licensed source', async () => {
    const source = await readFile(new URL('./content/source/fate-core-SRD.html', import.meta.url));
    expect(createHash('sha256').update(source).digest('hex')).toBe(metadata.sourceSha256);
    for (const citation of HEARTS_SOURCES) {
      const entry = references.find((entry) => entry.sourceLine === citation.line);
      expect(entry?.title, citation.element).toBe(citation.section);
      expect(entry?.body, citation.element).toContain(citation.evidence);
      expect(citation.changes).not.toBe('');
    }
    const citedText = HEARTS_SOURCES.map(
      (source) => references.find((entry) => entry.sourceLine === source.line)!.body,
    ).join('\n');
    const originalAspects = ['I choose my own contracts', 'Answers before payment', 'Landon’s mentor'];
    const c = heartsOfSteelCampaign();
    for (const ch of c.characters) {
      for (const aspect of ch.aspects) {
        if (originalAspects.includes(aspect.name)) continue;
        expect(citedText, `${ch.name}: ${aspect.name}`).toContain(aspect.name);
      }
      for (const stunt of ch.stunts) expect(citedText).toContain(stunt.name);
    }
    const credits = c.world.find((entry) => entry.kind === 'reference' && entry.visibility === 'shared')!;
    for (const aspect of originalAspects) expect(credits.body).toContain(aspect);
    expect(credits.body).toContain(metadata.attribution);
    expect(credits.body).toContain(metadata.licenseUrl);
    for (const source of HEARTS_SOURCES.filter((source) => source.visibility === 'shared'))
      expect(credits.body).toContain(`${metadata.sourceUrl}#L${source.line}`);
  });

  it('creates playable characters with valid allocations and SRD stunt costs', () => {
    const c = heartsOfSteelCampaign();
    expect(campaignSchema.parse(c)).toEqual(c);
    expect(() => assertReferences(c)).not.toThrow();
    expect(c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.name)).toEqual([
      'Landon',
      'Cynere',
      'Zird the Arcane',
    ]);
    for (const ch of c.characters) {
      expect(validateCharacter(ch, c.rules), ch.name).toEqual([]);
      if (ch.kind !== 'pc') continue;
      expect(Object.values(ch.skills).sort()).toEqual([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
      expect(ch.status).toBe('ready');
      expect(ch.stunts).toHaveLength(3);
      expect(deriveCharacter(ch, c.rules).refresh).toBe(3);
      expect(ch.fatePoints).toBe(3);
    }
    const landon = c.characters[0];
    expect(landon.stunts.find((stunt) => stunt.name === 'Backup Weapon')?.fateCost).toBe(1);
    expect(landon.stunts.find((stunt) => stunt.name === 'Tough as Nails')).toMatchObject({
      fateCost: 1,
      limit: 'session',
    });
    expect(c.characters[2].extras).toContain('Collegia Arcana Magic');
    expect(c.events).toEqual([]);
  });

  it('keeps preparation private and preserves attribution in both GM and player backups', async () => {
    const c = heartsOfSteelCampaign();
    const publicCopy = projectCampaign(c);
    expect(publicCopy.characters.every((ch) => ch.kind === 'pc')).toBe(true);
    expect(publicCopy.world.some((entry) => entry.title === 'Opening: a favor for Kale')).toBe(false);
    expect(publicCopy.world.some((entry) => entry.title === 'Future threads')).toBe(false);
    expect(publicCopy.world.some((entry) => entry.title === 'Opening — source and adaptation notes')).toBe(
      false,
    );
    expect(publicCopy.world.some((entry) => entry.body.includes(metadata.attribution))).toBe(true);
    for (const audience of ['gm', 'player'] as const) {
      for (const backup of [await exportCampaign(c, audience), await exportCampaignZip(c, audience)]) {
        const restored = await parseCampaignExport(backup);
        expect(restored.campaign.world.some((entry) => entry.body.includes(metadata.attribution))).toBe(true);
        expect(restored.campaign.world.some((entry) => entry.title === 'Opening: a favor for Kale')).toBe(
          audience === 'gm',
        );
        expect(() => assertReferences(restored.campaign)).not.toThrow();
      }
    }
    const another = heartsOfSteelCampaign();
    expect(another.id).not.toBe(c.id);
    expect(another.characters[0].id).not.toBe(c.characters[0].id);
  });
});

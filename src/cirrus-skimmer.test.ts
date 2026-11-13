import { describe, expect, it } from 'vitest';
import references from './content/accelerated-reference.json';
import metadata from './content/accelerated-metadata.json';
import { CIRRUS_SOURCES, cirrusSkimmerCampaign } from './cirrus-skimmer';
import { deriveCharacter, validateCharacter } from './domain/rules';
import { projectCampaign } from './network/projection';
import { exportCampaign, exportCampaignZip, parseCampaignExport } from './storage/backup';
import { assertReferences, campaignSchema } from './storage/schema';

describe('Cirrus Skimmer Accelerated starter', () => {
  it('creates valid, ready Accelerated characters and contrasting NPC profiles in a fresh campaign', () => {
    const c = cirrusSkimmerCampaign();
    expect(campaignSchema.parse(c)).toEqual(c);
    expect(() => assertReferences(c)).not.toThrow();
    expect(c.rules.system).toBe('fate-accelerated');
    expect(c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.name)).toEqual([
      'Voltaire',
      'Sanchez',
      'Mira Vale',
    ]);
    for (const ch of c.characters) {
      expect(validateCharacter(ch, c.rules), ch.name).toEqual([]);
      expect(ch.status).toBe('ready');
      expect(ch.phases).toEqual([]);
      if (ch.kind !== 'pc') continue;
      expect(Object.values(ch.skills).sort()).toEqual([0, 1, 1, 2, 2, 3]);
      expect(deriveCharacter(ch, c.rules)).toMatchObject({
        refresh: 3,
        tracks: [{ id: 'stress', boxes: [1, 2, 3] }],
      });
      expect(ch.fatePoints).toBe(3);
    }
    const shark = c.characters.find((ch) => ch.name === 'Sky shark')!;
    const party = c.characters.find((ch) => ch.name === 'Naval boarding party')!;
    expect(shark.mook).toMatchObject({ stressBoxes: 2 });
    expect(party.mook).toMatchObject({ groupSize: 4 });
    for (const ch of [shark, party])
      expect(deriveCharacter(ch, c.rules)).toMatchObject({
        tracks: [{ boxes: [1, 2] }],
        consequenceSlots: [],
      });
    expect(c.play.npcFatePoints).toBe(3);
    expect(c.play.aspects).toHaveLength(2);
    expect(c.events).toEqual([]);
    expect(cirrusSkimmerCampaign().id).not.toBe(c.id);
  });

  it('retains Voltaire’s source mechanics and identifies every adaptation with pinned attribution', () => {
    const c = cirrusSkimmerCampaign();
    const voltaire = c.characters[0];
    const source = references.find((entry) => entry.title === 'Voltaire')!;
    expect(voltaire.skills).toEqual({ careful: 1, clever: 1, flashy: 3, forceful: 0, quick: 2, sneaky: 2 });
    for (const aspect of voltaire.aspects) expect(source.body).toContain(aspect.name);
    expect(source.body).toContain(voltaire.stunts[0].name);
    expect(voltaire.stunts[0]).toMatchObject({ refreshCost: 1, fateCost: 0, limit: 'none' });
    const credits = c.world.find((entry) => entry.kind === 'reference')!;
    for (const citation of CIRRUS_SOURCES) {
      const original = references.find((entry) => entry.sourceLine === citation.line)!;
      expect(original.title).toBe(citation.section);
      expect(original.body.toLowerCase()).toContain(citation.evidence.toLowerCase());
      expect(credits.body).toContain(`${metadata.sourceUrl}#L${citation.line}`);
    }
    expect(credits.body).toContain(metadata.attribution);
    expect(credits.body).toContain(metadata.licenseUrl);
    expect(credits.body).toContain('not an official published adventure');
    expect(credits.body).toContain('companion additions');
  });

  it('keeps GM preparation private and preserves the source credit and selected system in portable backups', async () => {
    const c = cirrusSkimmerCampaign();
    const player = projectCampaign(c);
    expect(player.characters.map((ch) => ch.name)).toEqual(['Voltaire', 'Sanchez', 'Mira Vale']);
    expect(player.world.some((entry) => entry.title.startsWith('Opening:'))).toBe(false);
    expect(player.world.some((entry) => entry.title === 'Running the opening')).toBe(false);
    expect(player.world.find((entry) => entry.kind === 'reference')?.body).toContain(metadata.attribution);
    for (const backup of [
      await exportCampaign(c),
      await exportCampaignZip(c),
      await exportCampaign(c, 'player'),
    ]) {
      const restored = (await parseCampaignExport(backup)).campaign;
      expect(restored.rules.system).toBe('fate-accelerated');
      expect(restored.world.find((entry) => entry.kind === 'reference')?.body).toContain(
        metadata.attribution,
      );
    }
  });
});

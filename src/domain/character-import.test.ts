import { describe, expect, it } from 'vitest';
import { createCampaign, createCharacter } from './defaults';
import { prepareCharacterImport, ruleDifferences } from './character-import';

describe('Reviewed independent character imports', () => {
  it('preserves stats and portrait bytes while remapping identity and internal consequence references', () => {
    const campaign = createCampaign();
    const character = createCharacter(campaign.rules, 'Asha');
    character.status = 'ready';
    character.skills.lore = 4;
    character.fatePoints = 7;
    character.portraitAssetId = 'portrait';
    character.phases[0].characterIds = ['other-campaign-character'];
    character.aspects.push({
      id: 'wound',
      name: 'Bruised',
      kind: 'consequence',
      ownerId: character.id,
      freeInvokeOwnerId: 'external',
      freeInvokes: 1,
      visibility: 'shared',
    });
    character.consequences.push({
      id: 'wound',
      value: 2,
      name: 'Bruised',
      recovering: false,
      incurredConflictId: 'previous-conflict',
    });
    const source = {
      character,
      assets: [
        {
          id: 'portrait',
          name: 'face.png',
          mime: 'image/png',
          hash: 'same',
          dataUrl: 'data:image/png;base64,AQ==',
          visibility: 'shared' as const,
        },
      ],
    };
    campaign.assets.push(source.assets[0]);
    const result = prepareCharacterImport(source, campaign);
    expect(result.character).toMatchObject({
      name: 'Asha',
      status: 'draft',
      skills: { lore: 4 },
      fatePoints: 7,
      ownerId: 'gm',
    });
    expect(result.character.id).not.toBe(character.id);
    expect(result.assets[0].id).not.toBe('portrait');
    expect(result.assets[0].dataUrl).toBe(source.assets[0].dataUrl);
    expect(result.character.portraitAssetId).toBe(result.assets[0].id);
    expect(result.character.phases[0].characterIds).toEqual([]);
    const wound = result.character.aspects.find((a) => a.name === 'Bruised')!;
    expect(result.character.consequences[0].id).toBe(wound.id);
    expect(wound.ownerId).toBe(result.character.id);
    expect(wound.freeInvokeOwnerId).toBeUndefined();
    expect(result.character.consequences[0].incurredConflictId).toBeUndefined();
    expect(character.id).not.toBe(result.character.id);
    expect(character.phases[0].characterIds).toEqual(['other-campaign-character']);
  });
  it('reports mechanical differences without mistaking names/versions for mechanical changes', () => {
    const campaign = createCampaign(),
      other = structuredClone(campaign.rules);
    other.name = 'Other setting';
    other.version++;
    expect(ruleDifferences(other, campaign.rules)).toEqual([]);
    other.refresh = 4;
    other.skills.pop();
    expect(ruleDifferences(other, campaign.rules)).toEqual(['Skills', 'Base refresh']);
  });
});

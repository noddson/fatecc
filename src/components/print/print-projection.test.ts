import { describe, expect, it } from 'vitest';
import { createCampaign, createCharacter } from '../../domain/defaults';
import type { Actor, InventoryItem } from '../../domain/types';
import { campaignForPrint } from '../PrintSheets';

function fixture() {
  const campaign = createCampaign('Print privacy');
  const hero = createCharacter(campaign.rules, 'Mara');
  const other = createCharacter(campaign.rules, 'Silas');
  campaign.characters = [hero, other];
  const item = (id: string, ownerId: string, visibility: InventoryItem['visibility']): InventoryItem => ({
    id,
    revision: 0,
    name: id,
    ownerId,
    visibility,
    quantity: 1,
    unit: 'item',
    description: '',
  });
  campaign.inventory = [
    item('shared lantern', 'party', 'shared'),
    item('Mara private letter', hero.id, 'character'),
    item('Silas private key', other.id, 'character'),
    item('GM secret relic', 'party', 'gm'),
  ];
  const player: Actor = { id: 'player', role: 'player', characterIds: [hero.id] };
  return { campaign, player };
}

describe('print audience projection', () => {
  it('keeps public handouts free of private belongings and allows explicit local GM copies', () => {
    const { campaign } = fixture();
    expect(campaignForPrint(campaign).inventory.map((item) => item.name)).toEqual(['shared lantern']);
    expect(campaignForPrint(campaign, true).inventory).toHaveLength(4);
    expect(campaign.inventory).toHaveLength(4);
  });

  it('keeps the authenticated player’s private belongings while excluding other private items', () => {
    const { campaign, player } = fixture();
    expect(campaignForPrint(campaign, false, player).inventory.map((item) => item.name)).toEqual([
      'shared lantern',
      'Mara private letter',
    ]);
  });

  it('never escalates a player print through a GM role field or the private-copy flag', () => {
    const { campaign, player } = fixture();
    const forgedRole: Actor = { ...player, role: 'gm' };
    expect(campaignForPrint(campaign, true, forgedRole).inventory.map((item) => item.name)).toEqual([
      'shared lantern',
      'Mara private letter',
    ]);
  });
});

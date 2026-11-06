import { id } from './defaults';
import type { Campaign, InventoryItem } from './types';

function recordInventoryChange(campaign: Campaign, item: InventoryItem, removed = false): void {
  const owner = campaign.characters.find((character) => character.id === item.ownerId);
  campaign.events.push({
    id: id(),
    commandId: id(),
    sequence: (campaign.events.at(-1)?.sequence || 0) + 1,
    timestamp: new Date().toISOString(),
    actorId: campaign.members.find((member) => member.role === 'gm')?.id || 'gm',
    type: 'inventory',
    summary: `${removed ? 'Removed: ' : ''}${item.name} · ${item.quantity} ${item.unit} · ${owner?.name || 'Shared party inventory'}`,
    visibility: item.visibility === 'gm' || owner?.visibility === 'gm' ? 'gm' : item.visibility,
    // Keep the historical audience when an item is later transferred or made public.
    ...(item.visibility === 'character' ? { characterId: item.ownerId } : {}),
  });
}

/** Mutates a transaction draft. The UI's item revision prevents stale transfers. */
export function saveInventoryItem(campaign: Campaign, item: InventoryItem): void {
  if (
    item.visibility === 'character' &&
    !campaign.characters.some((character) => character.id === item.ownerId)
  )
    throw new Error('Choose a character under Held by for Character visibility.');
  const index = campaign.inventory.findIndex((entry) => entry.id === item.id);
  const original = index >= 0 ? campaign.inventory[index] : undefined;
  if ((original && original.revision !== item.revision) || (!original && item.revision > 0))
    throw new Error('This item changed or was removed. Reopen it before saving.');
  const next = { ...item, revision: (original?.revision || 0) + 1 };
  if (index >= 0) campaign.inventory[index] = next;
  else campaign.inventory.push(next);
  recordInventoryChange(campaign, next);
}

export function removeInventoryItem(campaign: Campaign, item: InventoryItem): void {
  const original = campaign.inventory.find((entry) => entry.id === item.id);
  if (!original || original.revision !== item.revision)
    throw new Error('This item changed or was removed. Reopen it before removing it.');
  campaign.inventory = campaign.inventory.filter((entry) => entry.id !== item.id);
  recordInventoryChange(campaign, original, true);
}

/** Keep possessions when deleting a character, without revealing private items. */
export function releaseCharacterInventory(campaign: Campaign, characterId: string): void {
  for (const item of campaign.inventory.filter((entry) => entry.ownerId === characterId)) {
    item.ownerId = 'party';
    if (item.visibility === 'character') item.visibility = 'gm';
    item.revision++;
  }
}

import type { Actor, Aspect, Campaign, GameEvent } from '../domain/types';

/** Construct a new, safe replica. Never send the host's aggregate and hide it in CSS. */
export function projectCampaign(
  campaign: Campaign,
  actor: Actor = { id: 'public-export', role: 'player', characterIds: [] },
): Campaign {
  const copy = structuredClone(campaign);
  if (actor.role === 'gm') return copy;
  const visibleCharacters = new Set(
    copy.characters.filter((c) => c.visibility === 'shared').map((c) => c.id),
  );
  const hiddenCharacters = new Set(copy.characters.filter((c) => c.visibility === 'gm').map((c) => c.id));
  const visibleAssets = new Set(copy.assets.filter((a) => a.visibility === 'shared').map((a) => a.id));
  const hiddenAspects = new Set(
    [...copy.issues, ...copy.play.aspects, ...copy.characters.flatMap((c) => c.aspects)]
      .filter((a) => a.visibility === 'gm' || !!(a.ownerId && hiddenCharacters.has(a.ownerId)))
      .map((a) => a.id),
  );
  for (const character of copy.characters.filter((c) => c.visibility === 'gm'))
    for (const aspect of character.aspects) hiddenAspects.add(aspect.id);
  const referencedAssets = new Set<string>();
  if (copy.bannerAssetId && visibleAssets.has(copy.bannerAssetId)) referencedAssets.add(copy.bannerAssetId);
  else {
    delete copy.bannerAssetId;
    delete copy.bannerPosition;
  }
  const cleanAspect = (aspect: Aspect): Aspect => {
    if (aspect.ownerId && !visibleCharacters.has(aspect.ownerId)) delete aspect.ownerId;
    if (aspect.freeInvokeOwnerId && !visibleCharacters.has(aspect.freeInvokeOwnerId))
      delete aspect.freeInvokeOwnerId;
    return aspect;
  };

  copy.characters = copy.characters
    .filter((c) => visibleCharacters.has(c.id))
    .map((c) => {
      c.aspects = c.aspects.filter((a) => !hiddenAspects.has(a.id)).map(cleanAspect);
      c.phases = c.phases.map((p) => ({
        ...p,
        characterIds: p.characterIds.filter((id) => visibleCharacters.has(id)),
      }));
      if (c.portraitAssetId && visibleAssets.has(c.portraitAssetId)) referencedAssets.add(c.portraitAssetId);
      else delete c.portraitAssetId;
      return c;
    });
  copy.issues = copy.issues.filter((a) => !hiddenAspects.has(a.id)).map(cleanAspect);
  copy.world = copy.world
    .filter((e) => e.visibility === 'shared')
    .map((e) => {
      if (e.assetId && visibleAssets.has(e.assetId)) referencedAssets.add(e.assetId);
      else delete e.assetId;
      return e;
    });
  copy.inventory = copy.inventory
    .filter(
      (e) =>
        e.visibility === 'shared' ||
        (e.visibility === 'character' &&
          visibleCharacters.has(e.ownerId) &&
          actor.characterIds.includes(e.ownerId)),
    )
    .map((e) => ({
      ...e,
      ownerId: visibleCharacters.has(e.ownerId) ? e.ownerId : 'party',
    }));
  copy.maps = copy.maps
    .filter((m) => m.visibility === 'shared' && !!m.sharedRevisionId)
    .flatMap((m) => {
      const revision = m.revisions.find((r) => r.id === m.sharedRevisionId);
      if (!revision || !visibleAssets.has(revision.assetId)) return [];
      referencedAssets.add(revision.assetId);
      revision.tokens = revision.tokens.filter(
        (t) => t.visibility === 'shared' && (!t.characterId || visibleCharacters.has(t.characterId)),
      );
      revision.annotations = revision.annotations.filter((a) => a.visibility === 'shared');
      m.revisions = [revision];
      m.currentRevisionId = revision.id;
      return [m];
    });
  copy.assets = copy.assets.filter((a) => referencedAssets.has(a.id));
  copy.members = copy.members.map((m) => ({
    ...m,
    characterIds: m.characterIds.filter((id) => visibleCharacters.has(id)),
  }));
  copy.play.aspects = copy.play.aspects.filter((a) => !hiddenAspects.has(a.id)).map(cleanAspect);
  copy.play.actedIds = copy.play.actedIds.filter((id) => visibleCharacters.has(id));
  copy.play.pendingAwards = copy.play.pendingAwards
    .filter((a) => visibleCharacters.has(a.characterId))
    .map((a) => ({ ...a, reason: 'Pending Fate-point award' }));
  copy.play.contest.scores = Object.fromEntries(
    Object.entries(copy.play.contest.scores).filter(([id]) => visibleCharacters.has(id)),
  );
  copy.play.npcFatePoints = 0;
  delete copy.play.npcCarryover;
  copy.events = copy.events
    .filter((event: GameEvent) => {
      if (event.visibility === 'gm') return false;
      if (
        event.visibility === 'character' &&
        (!event.characterId || !actor.characterIds.includes(event.characterId))
      )
        return false;
      if (event.characterId && !visibleCharacters.has(event.characterId)) return false;
      if (
        event.roll &&
        (!visibleCharacters.has(event.roll.characterId) ||
          event.roll.invocations.some((i) => hiddenAspects.has(i.aspectId)))
      )
        return false;
      if (event.roll?.targetCharacterId && !visibleCharacters.has(event.roll.targetCharacterId)) return false;
      return true;
    })
    .map((event, index) => {
      delete event.detail;
      delete event.undoChanges;
      if (event.roll?.helperIds)
        event.roll.helperIds = event.roll.helperIds.filter((id) => visibleCharacters.has(id));
      return { ...event, sequence: index + 1 };
    });
  copy.processedCommandIds = [];
  return copy;
}

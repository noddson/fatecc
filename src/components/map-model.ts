import type { CampaignMap, MapRevision, MapToken, Zone } from '../domain/types';

export function tokenPositionInZone(
  zone: Zone,
  tokens: MapToken[],
  tokenId: string,
  gapX: number,
  gapY: number,
) {
  const center = { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
  const candidates = [];
  for (let row = -3; row <= 3; row++)
    for (let col = -3; col <= 3; col++) {
      const x = center.x + col * gapX,
        y = center.y + row * gapY;
      if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height)
        candidates.push({ x, y, distance: col * col + row * row });
    }
  return (
    candidates
      .sort((a, b) => a.distance - b.distance)
      .find((point) =>
        tokens.every(
          (token) =>
            token.id === tokenId ||
            Math.abs(token.x - point.x) >= gapX * 0.9 ||
            Math.abs(token.y - point.y) >= gapY * 0.9,
        ),
      ) ?? center
  );
}

export const clampUnit = (value: number): number =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
export function normalizedPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): { x: number; y: number } {
  return {
    x: clampUnit((clientX - rect.left) / Math.max(rect.width, 1)),
    y: clampUnit((clientY - rect.top) / Math.max(rect.height, 1)),
  };
}
export function zoneAtPoint(zones: Zone[], x: number, y: number): string | undefined {
  return [...zones]
    .reverse()
    .find((zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height)?.id;
}
export function newMapRevision(
  map: CampaignMap | undefined,
  assetId: string,
  carry: boolean,
  fromRevisionId?: string,
): MapRevision {
  const source = map?.revisions.find((revision) => revision.id === (fromRevisionId ?? map.currentRevisionId));
  return {
    id: crypto.randomUUID(),
    assetId,
    createdAt: new Date().toISOString(),
    zones: carry && source ? structuredClone(source.zones) : [],
    tokens: carry && source ? structuredClone(source.tokens) : [],
    annotations: carry && source ? structuredClone(source.annotations) : [],
  };
}
export function connectZones(zones: Zone[], firstId: string, secondId: string, connected: boolean): Zone[] {
  if (firstId === secondId || !zones.some((z) => z.id === firstId) || !zones.some((z) => z.id === secondId))
    return zones;
  return zones.map((zone) => {
    const other = zone.id === firstId ? secondId : zone.id === secondId ? firstId : undefined;
    if (!other) return zone;
    return {
      ...zone,
      connections: connected
        ? [...new Set([...zone.connections, other])]
        : zone.connections.filter((id) => id !== other),
    };
  });
}

import { describe, expect, it } from 'vitest';
import type { CampaignMap, Zone } from '../domain/types';
import { connectZones, newMapRevision, normalizedPoint, tokenPositionInZone, zoneAtPoint } from './map-model';

describe('Map coordinates and immutable image revisions', () => {
  it('keeps placement consistent under zoom and clamps out-of-bounds drops', () => {
    expect(normalizedPoint(300, 150, { left: 100, top: 50, width: 400, height: 200 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizedPoint(500, 250, { left: 100, top: 50, width: 800, height: 400 })).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(normalizedPoint(-50, 500, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 1 });
  });
  const zones: Zone[] = [
    { id: 'a', name: 'Courtyard', x: 0, y: 0, width: 0.5, height: 0.5, aspect: '', connections: [] },
    { id: 'b', name: 'Tower', x: 0.5, y: 0.5, width: 0.5, height: 0.5, aspect: '', connections: [] },
  ];
  it('places zone arrivals in free positions while preserving the first empty center', () => {
    const center = tokenPositionInZone(zones[0], [], 'moving', 0.1, 0.1);
    expect(center).toMatchObject({ x: 0.25, y: 0.25 });
    const next = tokenPositionInZone(
      zones[0],
      [{ id: 'other', label: 'Other', ...center, visibility: 'shared' }],
      'moving',
      0.1,
      0.1,
    );
    expect(Math.hypot(next.x - center.x, next.y - center.y)).toBeGreaterThan(0.09);
    expect(zoneAtPoint(zones, next.x, next.y)).toBe('a');
  });
  it('maintains two-way zone connections and resolves token zones', () => {
    const linked = connectZones(zones, 'a', 'b', true);
    expect(linked[0].connections).toEqual(['b']);
    expect(linked[1].connections).toEqual(['a']);
    expect(connectZones(linked, 'a', 'b', false).map((z) => z.connections)).toEqual([[], []]);
    expect(zoneAtPoint(zones, 0.7, 0.8)).toBe('b');
    expect(zoneAtPoint(zones, 0.2, 0.8)).toBeUndefined();
  });
  it('clones or clears overlays without changing historical revisions', () => {
    const old = {
      id: 'old',
      assetId: 'old-image',
      createdAt: '2026-01-01',
      zones,
      tokens: [],
      annotations: [],
    };
    const map: CampaignMap = {
      id: 'map',
      name: 'Keep',
      visibility: 'shared',
      currentRevisionId: 'old',
      sharedRevisionId: 'old',
      revisions: [old],
    };
    const revision = newMapRevision(map, 'new-image', true);
    revision.zones[0].name = 'Ruined courtyard';
    expect(map.revisions[0].zones[0].name).toBe('Courtyard');
    expect(map.sharedRevisionId).toBe('old');
    expect(newMapRevision(map, 'other', false).zones).toEqual([]);
  });
});

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  Map as MapIcon,
  Upload,
  ZoomIn,
  ZoomOut,
  MousePointer2,
  SquareDashed,
  MapPin,
  Type,
  Eye,
  EyeOff,
  Copy,
  History,
  Check,
} from 'lucide-react';
import type { CampaignMap, MapRevision, MapToken, Zone, MapAnnotation } from '../domain/types';
import { createAsset } from '../storage/assets';
import { id } from '../domain/defaults';
import {
  Badge,
  ConfirmButton,
  Empty,
  Field,
  Modal,
  PageTitle,
  dateLabel,
  initials,
  type EditorProps,
} from '../ui';
import {
  clampUnit,
  connectZones,
  newMapRevision,
  normalizedPoint,
  tokenPositionInZone,
  zoneAtPoint,
} from './map-model';
import './Maps.css';

type Selection = { kind: 'zone' | 'token' | 'annotation'; id: string };
type Tool = 'select' | 'zone' | 'token' | 'annotation';
function PercentField({
  label,
  value,
  onCommit,
  max = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState((value * 100).toFixed(1));
  useEffect(() => setDraft((value * 100).toFixed(1)), [value]);
  return (
    <Field label={label}>
      <input
        type="number"
        min="0"
        max={max * 100}
        step="0.5"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft === (value * 100).toFixed(1)) return;
          const next = Number(draft);
          if (Number.isFinite(next)) {
            const position = Math.min(max, clampUnit(next / 100));
            if (Math.abs(position - value) > 0.000001) onCommit(position);
          } else setDraft((value * 100).toFixed(1));
        }}
      />
    </Field>
  );
}

export function Maps({ campaign, update, dispatch, notify, readOnly }: EditorProps) {
  const [mapId, setMapId] = useState(campaign.maps[0]?.id ?? '');
  const [viewId, setViewId] = useState('');
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>();
  const [tokenCharacterId, setTokenCharacterId] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File>();
  const [carry, setCarry] = useState(true);
  const [dragging, setDragging] = useState<{
    id: string;
    x: number;
    y: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  }>();
  const stage = useRef<HTMLDivElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const suppressClick = useRef(false);
  const [pendingMoves, setPendingMoves] = useState<Record<string, { x: number; y: number }>>({});
  const map = campaign.maps.find((item) => item.id === mapId) ?? campaign.maps[0];
  const revision =
    map?.revisions.find((item) => item.id === viewId) ??
    map?.revisions.find((item) => item.id === map.currentRevisionId);
  const asset = campaign.assets.find((item) => item.id === revision?.assetId);
  useEffect(() => {
    setPendingMoves((pending) =>
      Object.fromEntries(
        Object.entries(pending).filter(([tokenId, position]) => {
          const token = revision?.tokens.find((item) => item.id === tokenId);
          return token && (token.x !== position.x || token.y !== position.y);
        }),
      ),
    );
  }, [revision]);
  const editable = !readOnly && revision?.id === map?.currentRevisionId;
  const selectedZone =
    selection?.kind === 'zone' ? revision?.zones.find((zone) => zone.id === selection.id) : undefined;
  const selectedToken =
    selection?.kind === 'token' ? revision?.tokens.find((token) => token.id === selection.id) : undefined;
  const selectedAnnotation =
    selection?.kind === 'annotation'
      ? revision?.annotations.find((note) => note.id === selection.id)
      : undefined;

  const report = (error: unknown) =>
    notify(error instanceof Error ? error.message : 'The map could not be updated.', true);
  async function editRevision(change: (revision: MapRevision, map: CampaignMap) => void) {
    if (!map || !revision || !editable) return;
    try {
      await update((draft) => {
        const m = draft.maps.find((item) => item.id === map.id)!;
        const r = m.revisions.find((item) => item.id === revision.id)!;
        change(r, m);
      });
    } catch (error) {
      report(error);
    }
  }
  async function upload(file: File, replace = false) {
    setUploading(true);
    try {
      const image = await createAsset(file, 'gm');
      const nextRevision = newMapRevision(
        replace ? map : undefined,
        image.id,
        replace && carry,
        revision?.id,
      );
      const newMapId = replace && map ? map.id : id();
      const saved = await update((draft) => {
        draft.assets.push(image);
        if (replace && map) {
          const m = draft.maps.find((item) => item.id === map.id)!;
          m.revisions.push(nextRevision);
          m.currentRevisionId = nextRevision.id;
        } else
          draft.maps.push({
            id: newMapId,
            name: file.name.replace(/\.[^.]+$/, ''),
            visibility: 'gm',
            currentRevisionId: nextRevision.id,
            revisions: [nextRevision],
          });
      });
      if (!saved) return;
      setMapId(newMapId);
      setViewId(nextRevision.id);
      setSelection(undefined);
      setZoom(1);
      setReplacementFile(undefined);
      notify(
        replace ? 'New map revision saved. Previous versions are preserved.' : 'Map saved to this device.',
      );
    } catch (error) {
      report(error);
    } finally {
      setUploading(false);
    }
  }
  async function moveToken(token: MapToken, x: number, y: number, zoneId?: string | null) {
    if (!map || !revision) return;
    const zone = zoneId ? revision.zones.find((item) => item.id === zoneId) : undefined;
    if (zone && token.zoneId !== zone.id) {
      const bounds = stage.current?.getBoundingClientRect();
      ({ x, y } = tokenPositionInZone(
        zone,
        revision.tokens,
        token.id,
        48 / (bounds?.width || 640),
        48 / (bounds?.height || 427),
      ));
    }
    x = clampUnit(x);
    y = clampUnit(y);
    const destinationZone = zoneId === null ? undefined : (zoneId ?? zoneAtPoint(revision.zones, x, y));
    if (token.x === x && token.y === y && token.zoneId === destinationZone) return;
    const position = { x, y };
    setPendingMoves((pending) => ({ ...pending, [token.id]: position }));
    const clearPending = () =>
      setPendingMoves((pending) => {
        if (pending[token.id] !== position) return pending;
        const next = { ...pending };
        delete next[token.id];
        return next;
      });
    try {
      const saved = await dispatch({
        type: 'moveToken',
        mapId: map.id,
        revisionId: revision.id,
        tokenId: token.id,
        x: clampUnit(x),
        y: clampUnit(y),
        zoneId: destinationZone,
      });
      if (!saved) clearPending();
    } catch (error) {
      clearPending();
      report(error);
    }
  }
  function point(event: { clientX: number; clientY: number }) {
    return normalizedPoint(event.clientX, event.clientY, stage.current!.getBoundingClientRect());
  }
  function clickMap(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!revision || !stage.current) return;
    const { x, y } = point(event);
    if (tool === 'select') {
      if (selectedToken && (editable || readOnly)) void moveToken(selectedToken, x, y);
      return;
    }
    if (!editable) return;
    if (tool === 'zone') {
      const zone: Zone = {
        id: id(),
        name: `Zone ${revision.zones.length + 1}`,
        x: Math.min(x, 0.75),
        y: Math.min(y, 0.8),
        width: 0.25,
        height: 0.2,
        aspect: '',
        connections: [],
      };
      void editRevision((r) => r.zones.push(zone));
      setSelection({ kind: 'zone', id: zone.id });
      setTool('select');
    } else if (tool === 'token') {
      const character = campaign.characters.find((c) => c.id === tokenCharacterId);
      const token: MapToken = {
        id: id(),
        characterId: character?.id,
        label: character?.name ?? `Marker ${revision.tokens.length + 1}`,
        x,
        y,
        zoneId: zoneAtPoint(revision.zones, x, y),
        visibility: character?.visibility ?? 'shared',
      };
      void editRevision((r) => r.tokens.push(token));
      setSelection({ kind: 'token', id: token.id });
      setTool('select');
    } else if (tool === 'annotation') {
      if (!annotationText.trim()) {
        notify('Enter an annotation in the map tools first.', true);
        return;
      }
      const note: MapAnnotation = { id: id(), text: annotationText.trim(), x, y, visibility: 'gm' };
      void editRevision((r) => r.annotations.push(note));
      setSelection({ kind: 'annotation', id: note.id });
      setTool('select');
      setAnnotationText('');
    }
  }
  function dragDestination(event: { clientX: number; clientY: number }) {
    const destination = point(event);
    return {
      x: clampUnit(dragging!.originX + destination.x - dragging!.startX),
      y: clampUnit(dragging!.originY + destination.y - dragging!.startY),
    };
  }
  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging || !stage.current) return;
    setDragging({ ...dragging, ...dragDestination(event) });
  }
  function dragEnd(event: PointerEvent<HTMLButtonElement>, token: MapToken) {
    if (!dragging) return;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    const destination = dragDestination(event);
    setDragging(undefined);
    if (Math.abs(destination.x - token.x) + Math.abs(destination.y - token.y) > 0.002) {
      suppressClick.current = true;
      void moveToken(token, destination.x, destination.y);
    }
  }
  async function shareRevision() {
    if (!map || !revision || readOnly) return;
    try {
      const saved = await update((draft) => {
        const m = draft.maps.find((item) => item.id === map.id)!;
        m.visibility = 'shared';
        m.sharedRevisionId = revision.id;
        const a = draft.assets.find((item) => item.id === revision.assetId)!;
        a.visibility = 'shared';
      });
      if (saved) notify('This map revision is shared with players.');
    } catch (error) {
      report(error);
    }
  }
  async function workingCopy() {
    if (!map || !revision) return;
    const next = newMapRevision(map, revision.assetId, true, revision.id);
    try {
      const saved = await update((draft) => {
        const m = draft.maps.find((item) => item.id === map.id)!;
        m.revisions.push(next);
        m.currentRevisionId = next.id;
      });
      if (saved) {
        setViewId(next.id);
        setSelection(undefined);
      }
    } catch (error) {
      report(error);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="Places to make history"
        title="The world at your table"
        text="Bring a map, give its places meaning, and let the story change them."
        actions={
          !readOnly && (
            <button className="button-primary" disabled={uploading} onClick={() => addInput.current?.click()}>
              <Upload size={16} />
              {uploading ? 'Saving image…' : 'Upload map'}
            </button>
          )
        }
      />
      <input
        ref={addInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Upload map image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = '';
        }}
      />
      <input
        ref={replaceInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Replace map image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            setReplacementFile(file);
            setCarry(true);
          }
          event.target.value = '';
        }}
      />
      {!map || !revision || !asset ? (
        <Empty
          icon={<MapIcon size={34} />}
          title={readOnly ? 'No shared maps yet' : 'Every place has a story'}
          text={
            readOnly
              ? 'Your GM can share a map with the table when it is ready.'
              : 'Upload a map from Inkarnate or any image editor. Add Fate zones, characters, and notes as your campaign grows.'
          }
          action={
            !readOnly && (
              <button onClick={() => addInput.current?.click()}>
                <Upload size={16} />
                Choose a map image
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="map-switcher">
            {campaign.maps.map((item) => (
              <button
                key={item.id}
                className={item.id === map.id ? 'active' : ''}
                onClick={() => {
                  setMapId(item.id);
                  setViewId('');
                  setSelection(undefined);
                  setZoom(1);
                }}
              >
                <MapIcon size={15} />
                {item.name}
                {item.visibility === 'gm' && <EyeOff size={13} />}
              </button>
            ))}
          </div>
          <div className="map-workspace">
            <section className="map-main panel">
              <div className="map-toolbar">
                <div className="map-title">
                  <h2>{map.name}</h2>
                  <Badge
                    tone={map.sharedRevisionId === revision.id && map.visibility === 'shared' ? 'green' : ''}
                  >
                    {map.sharedRevisionId === revision.id && map.visibility === 'shared'
                      ? 'Shared with table'
                      : 'GM workspace'}
                  </Badge>
                </div>
                <div className="map-zoom">
                  <button
                    className="icon-button"
                    aria-label="Zoom out"
                    disabled={zoom <= 0.5}
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                  >
                    <ZoomOut size={18} />
                  </button>
                  <button className="map-zoom-value" onClick={() => setZoom(1)} aria-label="Reset map zoom">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Zoom in"
                    disabled={zoom >= 3}
                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                  >
                    <ZoomIn size={18} />
                  </button>
                </div>
              </div>
              <div className="map-viewport" aria-label="Map canvas. Scroll to pan.">
                <div
                  ref={stage}
                  className={`map-stage tool-${tool}`}
                  style={{ width: `${zoom * 100}%` }}
                  onClick={clickMap}
                  onPointerDownCapture={() => {
                    suppressClick.current = false;
                  }}
                  onClickCapture={(event) => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                >
                  <img className="map-image" src={asset.dataUrl} alt={map.name} draggable={false} />
                  <svg
                    className="map-connections"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {revision.zones.flatMap((zone) =>
                      zone.connections
                        .filter((otherId) => zone.id < otherId)
                        .map((otherId) => {
                          const other = revision.zones.find((item) => item.id === otherId);
                          return other ? (
                            <line
                              key={`${zone.id}-${otherId}`}
                              x1={(zone.x + zone.width / 2) * 100}
                              y1={(zone.y + zone.height / 2) * 100}
                              x2={(other.x + other.width / 2) * 100}
                              y2={(other.y + other.height / 2) * 100}
                            />
                          ) : null;
                        }),
                    )}
                  </svg>
                  {revision.zones.map((zone) => (
                    <button
                      key={zone.id}
                      className={`map-zone ${selectedZone?.id === zone.id ? 'selected' : ''}`}
                      style={{
                        left: `${zone.x * 100}%`,
                        top: `${zone.y * 100}%`,
                        width: `${zone.width * 100}%`,
                        height: `${zone.height * 100}%`,
                        pointerEvents: tool === 'select' ? 'auto' : 'none',
                      }}
                      aria-label={`Zone: ${zone.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (selectedToken && (editable || readOnly))
                          void moveToken(
                            selectedToken,
                            zone.x + zone.width / 2,
                            zone.y + zone.height / 2,
                            zone.id,
                          );
                        else setSelection({ kind: 'zone', id: zone.id });
                      }}
                    >
                      <span>{zone.name}</span>
                      {zone.aspect && <small>{zone.aspect}</small>}
                    </button>
                  ))}
                  {revision.annotations.map((note) => (
                    <button
                      key={note.id}
                      className={`map-annotation ${note.visibility === 'gm' ? 'private' : ''} ${selectedAnnotation?.id === note.id ? 'selected' : ''}`}
                      style={{
                        left: `${note.x * 100}%`,
                        top: `${note.y * 100}%`,
                        pointerEvents: tool === 'select' ? 'auto' : 'none',
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelection({ kind: 'annotation', id: note.id });
                      }}
                    >
                      <Type size={11} />
                      {note.text}
                      {note.visibility === 'gm' && <EyeOff size={11} />}
                    </button>
                  ))}
                  {revision.tokens.map((token) => {
                    const moving = dragging?.id === token.id ? dragging : (pendingMoves[token.id] ?? token);
                    const character = campaign.characters.find((c) => c.id === token.characterId);
                    const portrait = campaign.assets.find((a) => a.id === character?.portraitAssetId);
                    return (
                      <button
                        key={token.id}
                        className={`map-token ${selectedToken?.id === token.id ? 'selected' : ''} ${token.visibility === 'gm' ? 'private' : ''}`}
                        style={{
                          left: `${moving.x * 100}%`,
                          top: `${moving.y * 100}%`,
                          pointerEvents: tool === 'select' ? 'auto' : 'none',
                        }}
                        aria-label={`Token: ${token.label}`}
                        title={`${token.label}${token.visibility === 'gm' ? ' · GM only' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          suppressClick.current = false;
                          setSelection({ kind: 'token', id: token.id });
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (event.button !== 0) return;
                          if (!(editable || readOnly) || tool !== 'select') return;
                          setSelection({ kind: 'token', id: token.id });
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const start = point(event);
                          setDragging({
                            id: token.id,
                            x: token.x,
                            y: token.y,
                            originX: token.x,
                            originY: token.y,
                            startX: start.x,
                            startY: start.y,
                          });
                        }}
                        onPointerMove={dragMove}
                        onPointerUp={(event) => dragEnd(event, token)}
                        onPointerCancel={() => setDragging(undefined)}
                      >
                        {portrait ? (
                          <img src={portrait.dataUrl} alt="" draggable={false} />
                        ) : (
                          <span>{initials(token.label)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="map-canvas-hint">
                <MousePointer2 size={14} />
                {tool === 'zone'
                  ? 'Click the map to place a zone. Adjust its size in the tools.'
                  : tool === 'token'
                    ? 'Click the map to place the selected character or marker.'
                    : tool === 'annotation'
                      ? 'Click the map to place your annotation.'
                      : selectedToken
                        ? 'Drag this token, or click the map or a zone to move it.'
                        : 'Select a token or zone. Scroll to pan and use the zoom controls to explore.'}
              </div>
            </section>
            <aside className="map-tools">
              <section className="panel">
                <h2>Map tools</h2>
                {editable ? (
                  <>
                    <div className="map-tool-buttons">
                      {(
                        [
                          { key: 'select', label: 'Select', icon: <MousePointer2 size={17} /> },
                          { key: 'zone', label: 'Zone', icon: <SquareDashed size={17} /> },
                          { key: 'token', label: 'Token', icon: <MapPin size={17} /> },
                          { key: 'annotation', label: 'Note', icon: <Type size={17} /> },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          className={tool === item.key ? 'active' : ''}
                          aria-pressed={tool === item.key}
                          onClick={() => {
                            setTool(item.key);
                            setSelection(undefined);
                          }}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                    {tool === 'token' && (
                      <Field label="Character for new token">
                        <select
                          value={tokenCharacterId}
                          onChange={(event) => setTokenCharacterId(event.target.value)}
                        >
                          <option value="">Generic marker</option>
                          {campaign.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {tool === 'annotation' && (
                      <Field label="Annotation text">
                        <textarea
                          rows={3}
                          value={annotationText}
                          onChange={(event) => setAnnotationText(event.target.value)}
                          placeholder="A clue, a landmark, a possibility…"
                        />
                      </Field>
                    )}
                  </>
                ) : (
                  <p className="muted">
                    {readOnly
                      ? 'Select your character’s token and drag it or click its destination. The host checks character ownership.'
                      : 'You are viewing a preserved revision. Make a working copy to edit it.'}
                  </p>
                )}
                {selectedZone && (
                  <div className="map-selection-editor">
                    <div className="section-heading">
                      <h3>Zone</h3>
                      <button className="text-button" onClick={() => setSelection(undefined)}>
                        Deselect
                      </button>
                    </div>
                    <fieldset disabled={!editable} className="unframed">
                      <Field label="Zone name">
                        <input
                          key={`${selectedZone.id}-name`}
                          defaultValue={selectedZone.name}
                          onBlur={(event) =>
                            void editRevision((r) => {
                              r.zones.find((z) => z.id === selectedZone.id)!.name = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Zone aspect">
                        <textarea
                          key={`${selectedZone.id}-aspect`}
                          rows={2}
                          defaultValue={selectedZone.aspect}
                          onBlur={(event) =>
                            void editRevision((r) => {
                              r.zones.find((z) => z.id === selectedZone.id)!.aspect = event.target.value;
                            })
                          }
                        />
                      </Field>
                      <div className="map-position-grid">
                        {(['x', 'y', 'width', 'height'] as const).map((key) => (
                          <PercentField
                            key={`${selectedZone.id}-${key}`}
                            label={`${key === 'x' ? 'Left' : key === 'y' ? 'Top' : key === 'width' ? 'Width' : 'Height'} %`}
                            value={selectedZone[key]}
                            max={
                              key === 'width'
                                ? 1 - selectedZone.x
                                : key === 'height'
                                  ? 1 - selectedZone.y
                                  : key === 'x'
                                    ? 1 - selectedZone.width
                                    : 1 - selectedZone.height
                            }
                            onCommit={(value) =>
                              void editRevision((r) => {
                                r.zones.find((z) => z.id === selectedZone.id)![key] = value;
                              })
                            }
                          />
                        ))}
                      </div>
                      <p className="eyebrow">Connected zones</p>
                      {revision.zones
                        .filter((z) => z.id !== selectedZone.id)
                        .map((z) => (
                          <label className="map-connection-choice" key={z.id}>
                            <input
                              type="checkbox"
                              checked={selectedZone.connections.includes(z.id)}
                              onChange={(event) =>
                                void editRevision((r) => {
                                  r.zones = connectZones(
                                    r.zones,
                                    selectedZone.id,
                                    z.id,
                                    event.target.checked,
                                  );
                                })
                              }
                            />
                            {z.name}
                          </label>
                        ))}
                    </fieldset>
                    {editable && (
                      <ConfirmButton
                        title={`Remove zone ${selectedZone.name}?`}
                        onConfirm={() => {
                          void editRevision((r) => {
                            r.zones = r.zones
                              .filter((z) => z.id !== selectedZone.id)
                              .map((z) => ({
                                ...z,
                                connections: z.connections.filter((link) => link !== selectedZone.id),
                              }));
                            r.tokens = r.tokens.map((t) =>
                              t.zoneId === selectedZone.id ? { ...t, zoneId: undefined } : t,
                            );
                          });
                          setSelection(undefined);
                        }}
                      />
                    )}
                  </div>
                )}
                {selectedToken && (
                  <div className="map-selection-editor">
                    <div className="section-heading">
                      <h3>Token</h3>
                      <button className="text-button" onClick={() => setSelection(undefined)}>
                        Deselect
                      </button>
                    </div>
                    {editable && (
                      <>
                        <Field label="Token label">
                          <input
                            key={`${selectedToken.id}-label`}
                            defaultValue={selectedToken.label}
                            onBlur={(event) =>
                              void editRevision((r) => {
                                r.tokens.find((t) => t.id === selectedToken.id)!.label = event.target.value;
                              })
                            }
                          />
                        </Field>
                        <Field label="Token visibility">
                          <select
                            value={selectedToken.visibility}
                            onChange={(event) =>
                              void editRevision((r) => {
                                r.tokens.find((t) => t.id === selectedToken.id)!.visibility = event.target
                                  .value as 'gm' | 'shared';
                              })
                            }
                          >
                            <option value="shared">Shared with players</option>
                            <option value="gm">GM only</option>
                          </select>
                        </Field>
                      </>
                    )}
                    <Field label="Move to zone">
                      <select
                        value={selectedToken.zoneId ?? ''}
                        onChange={(event) => {
                          const zone = revision.zones.find((z) => z.id === event.target.value);
                          if (zone)
                            void moveToken(
                              selectedToken,
                              zone.x + zone.width / 2,
                              zone.y + zone.height / 2,
                              zone.id,
                            );
                          else void moveToken(selectedToken, selectedToken.x, selectedToken.y, null);
                        }}
                        disabled={!editable && !readOnly}
                      >
                        <option value="">Between zones</option>
                        {revision.zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="map-position-grid">
                      <PercentField
                        label="Left %"
                        value={selectedToken.x}
                        onCommit={(x) => void moveToken(selectedToken, x, selectedToken.y)}
                      />
                      <PercentField
                        label="Top %"
                        value={selectedToken.y}
                        onCommit={(y) => void moveToken(selectedToken, selectedToken.x, y)}
                      />
                    </div>
                    {editable && (
                      <ConfirmButton
                        title={`Remove token ${selectedToken.label}?`}
                        onConfirm={() => {
                          void editRevision((r) => {
                            r.tokens = r.tokens.filter((t) => t.id !== selectedToken.id);
                          });
                          setSelection(undefined);
                        }}
                      />
                    )}
                  </div>
                )}
                {selectedAnnotation && (
                  <div className="map-selection-editor">
                    <div className="section-heading">
                      <h3>Annotation</h3>
                      <button className="text-button" onClick={() => setSelection(undefined)}>
                        Deselect
                      </button>
                    </div>
                    <fieldset disabled={!editable} className="unframed">
                      <Field label="Annotation">
                        <textarea
                          rows={3}
                          key={selectedAnnotation.id}
                          defaultValue={selectedAnnotation.text}
                          onBlur={(event) =>
                            void editRevision((r) => {
                              r.annotations.find((n) => n.id === selectedAnnotation.id)!.text =
                                event.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Annotation visibility">
                        <select
                          value={selectedAnnotation.visibility}
                          onChange={(event) =>
                            void editRevision((r) => {
                              r.annotations.find((n) => n.id === selectedAnnotation.id)!.visibility = event
                                .target.value as 'gm' | 'shared';
                            })
                          }
                        >
                          <option value="gm">GM only</option>
                          <option value="shared">Shared with players</option>
                        </select>
                      </Field>
                      <div className="map-position-grid">
                        <PercentField
                          label="Left %"
                          value={selectedAnnotation.x}
                          onCommit={(x) =>
                            void editRevision((r) => {
                              r.annotations.find((n) => n.id === selectedAnnotation.id)!.x = x;
                            })
                          }
                        />
                        <PercentField
                          label="Top %"
                          value={selectedAnnotation.y}
                          onCommit={(y) =>
                            void editRevision((r) => {
                              r.annotations.find((n) => n.id === selectedAnnotation.id)!.y = y;
                            })
                          }
                        />
                      </div>
                    </fieldset>
                    {editable && (
                      <ConfirmButton
                        title="Remove this annotation?"
                        onConfirm={() => {
                          void editRevision((r) => {
                            r.annotations = r.annotations.filter((n) => n.id !== selectedAnnotation.id);
                          });
                          setSelection(undefined);
                        }}
                      />
                    )}
                  </div>
                )}
                {!selection && tool === 'select' && (
                  <div className="map-object-list">
                    {revision.zones.length + revision.tokens.length === 0 ? (
                      <p className="muted">
                        Add zones to describe meaningful places. Tokens show who is where.
                      </p>
                    ) : (
                      <>
                        {revision.zones.map((z) => (
                          <button key={z.id} onClick={() => setSelection({ kind: 'zone', id: z.id })}>
                            <SquareDashed size={15} />
                            {z.name}
                          </button>
                        ))}
                        {revision.tokens.map((t) => (
                          <button key={t.id} onClick={() => setSelection({ kind: 'token', id: t.id })}>
                            <MapPin size={15} />
                            {t.label}
                            {t.visibility === 'gm' && <EyeOff size={12} />}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </section>
              <section className="panel">
                <h2>
                  <History size={17} />
                  Map revisions
                </h2>
                <Field label="View revision">
                  <select
                    value={revision.id}
                    onChange={(event) => {
                      setViewId(event.target.value);
                      setSelection(undefined);
                      setTool('select');
                    }}
                  >
                    {[...map.revisions].reverse().map((r, index) => (
                      <option key={r.id} value={r.id}>
                        {map.revisions.length - index}. {dateLabel(r.createdAt)}
                        {r.id === map.currentRevisionId ? ' · Working' : ''}
                        {r.id === map.sharedRevisionId && map.visibility === 'shared' ? ' · Shared' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                {!readOnly && (
                  <>
                    <button
                      className="map-full-button"
                      disabled={uploading}
                      onClick={() => replaceInput.current?.click()}
                    >
                      <Upload size={15} />
                      Replace image
                    </button>
                    {!editable && (
                      <button className="map-full-button" onClick={() => void workingCopy()}>
                        <Copy size={15} />
                        Make working copy
                      </button>
                    )}
                    <button className="map-full-button button-primary" onClick={() => void shareRevision()}>
                      <Eye size={15} />
                      {map.sharedRevisionId === revision.id && map.visibility === 'shared'
                        ? 'Revision shared'
                        : 'Share this revision'}
                    </button>
                    {map.visibility === 'shared' && (
                      <button
                        className="map-full-button"
                        onClick={() =>
                          void update((draft) => {
                            draft.maps.find((m) => m.id === map.id)!.visibility = 'gm';
                          }).catch(report)
                        }
                      >
                        <EyeOff size={15} />
                        Stop sharing map
                      </button>
                    )}
                    <p className="muted map-small">
                      Players receive the whole selected image and shared overlays. Previously shared images
                      cannot be recalled.
                    </p>
                    <Field label="Map name">
                      <input
                        key={map.id}
                        defaultValue={map.name}
                        onBlur={(event) =>
                          void update((draft) => {
                            draft.maps.find((m) => m.id === map.id)!.name = event.target.value;
                          }).catch(report)
                        }
                      />
                    </Field>
                    <ConfirmButton
                      title={`Delete map ${map.name}?`}
                      onConfirm={() => {
                        void update((draft) => {
                          draft.maps = draft.maps.filter((m) => m.id !== map.id);
                          const used = new Set(
                            [
                              ...draft.characters.map((c) => c.portraitAssetId),
                              ...draft.world.map((w) => w.assetId),
                              ...draft.maps.flatMap((m) => m.revisions.map((r) => r.assetId)),
                            ].filter(Boolean),
                          );
                          draft.assets = draft.assets.filter((a) => used.has(a.id));
                        }).catch(report);
                        setViewId('');
                        setSelection(undefined);
                      }}
                    />
                  </>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
      {replacementFile && (
        <Modal title="Save a new map revision" close={() => setReplacementFile(undefined)}>
          <p>The existing image and its overlays will remain in the revision history.</p>
          <p>
            <strong>{replacementFile.name}</strong>
          </p>
          <label className="map-carry-choice">
            <input type="radio" name="carry-overlays" checked={carry} onChange={() => setCarry(true)} />
            <span>
              <strong>Carry current overlays forward</strong>
              <small>Keep zones, tokens, and annotations at their relative positions.</small>
            </span>
          </label>
          <label className="map-carry-choice">
            <input type="radio" name="carry-overlays" checked={!carry} onChange={() => setCarry(false)} />
            <span>
              <strong>Start with a clean map</strong>
              <small>The new revision begins without overlays.</small>
            </span>
          </label>
          <div className="modal-actions">
            <button onClick={() => setReplacementFile(undefined)}>Cancel</button>
            <button
              className="button-primary"
              disabled={uploading}
              onClick={() => void upload(replacementFile, true)}
            >
              <Check size={16} />
              {uploading ? 'Saving…' : 'Save new revision'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

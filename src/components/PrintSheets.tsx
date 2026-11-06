import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import type { Actor, Campaign } from '../domain/types';
import { projectCampaign } from '../network/projection';
import { Field, Modal, PageTitle } from '../ui';
import { CharacterSheet } from './print/CharacterSheet';
import { GameWorksheet, TableWorksheet } from './print/CampaignSheets';
import { PrintFolio } from './print/PrintFolio';
import './PrintSheets.css';

export function campaignForPrint(campaign: Campaign, includePrivate = false, playerActor?: Actor): Campaign {
  // Maps and event history are not printed. Avoid cloning their potentially large
  // image/history payloads while keeping the same visibility projection as exports.
  const portraits = new Set(campaign.characters.map((ch) => ch.portraitAssetId));
  const printable = {
    ...campaign,
    bannerAssetId: undefined,
    bannerPosition: undefined,
    maps: [],
    events: [],
    processedCommandIds: [],
    assets: campaign.assets.filter((asset) => portraits.has(asset.id)),
  };
  return includePrivate && !playerActor
    ? printable
    : projectCampaign(printable, playerActor ? { ...playerActor, role: 'player' } : undefined);
}

export function PrintSheets({
  campaign,
  readOnly = false,
  characterId,
  embedded = false,
  playerActor,
}: {
  campaign: Campaign;
  readOnly?: boolean;
  characterId?: string;
  embedded?: boolean;
  playerActor?: Actor;
}) {
  const [audience, setAudience] = useState<'shared' | 'gm'>('shared');
  const [paper, setPaper] = useState<'A4' | 'Letter'>('Letter');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const preview = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const paperWidth = paper === 'Letter' ? 215.9 : 210;
  const paperHeight = paper === 'Letter' ? 279.4 : 297;
  const width = orientation === 'portrait' ? paperWidth : paperHeight;
  const height = orientation === 'portrait' ? paperHeight : paperWidth;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    if (preview.current) observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
  const [game, setGame] = useState(!characterId);
  const [table, setTable] = useState(false);
  const [details, setDetails] = useState(false);
  const [selected, setSelected] = useState(() =>
    characterId ? [characterId] : campaign.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.id),
  );
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  // Apply the same projection as player exports BEFORE building any print DOM.
  const c = useMemo(
    () => campaignForPrint(campaign, audience === 'gm' && !readOnly, readOnly ? playerActor : undefined),
    [campaign, audience, readOnly, playerActor],
  );
  const characters = c.characters.filter((ch) => selected.includes(ch.id));
  const hasSheets = (!characterId && (game || table)) || characters.length > 0;
  async function print() {
    setPrinting(true);
    setPrintError('');
    try {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.querySelectorAll<HTMLImageElement>('.print-packet img')).map((img) =>
          img.decode().catch(() => {}),
        ),
      );
      window.print();
    } catch {
      setPrintError('The print dialog could not open. Try your browser’s Print command.');
    } finally {
      setPrinting(false);
    }
  }
  return (
    <div className="print-workspace">
      {hasSheets && <PrintFolio />}
      <style media="print">{`@page { size: ${paper} ${orientation}; margin: 10mm 10mm 8mm; }`}</style>
      <div className="no-print">
        {!embedded && (
          <PageTitle
            eyebrow="From screen to table"
            title="Print sheets"
            text="Prepare here. Play on paper. Choose the sheets to bring to your table."
          />
        )}
        <section className="panel print-controls" aria-label="Print options">
          <div className="print-options-row">
            <Field label="Audience">
              <select
                value={readOnly ? 'shared' : audience}
                onChange={(e) => setAudience(e.target.value as 'shared' | 'gm')}
              >
                <option value="shared">{readOnly ? 'Your copy' : 'Shared handout'}</option>
                {!readOnly && <option value="gm">GM copy (includes secrets)</option>}
              </select>
            </Field>
            <Field label="Paper size">
              <select
                value={`${paper}-${orientation}`}
                onChange={(e) => {
                  const [size, direction] = e.target.value.split('-');
                  setPaper(size as 'A4' | 'Letter');
                  setOrientation(direction as 'portrait' | 'landscape');
                }}
              >
                <option value="Letter-portrait">US Letter (Portrait)</option>
                <option value="Letter-landscape">US Letter (Landscape)</option>
                <option value="A4-portrait">A4 (Portrait)</option>
                <option value="A4-landscape">A4 (Landscape)</option>
              </select>
            </Field>
            <button className="button-primary" disabled={!hasSheets || printing} onClick={() => void print()}>
              <Printer size={17} />
              {printing ? 'Preparing…' : 'Print / Save PDF'}
            </button>
          </div>
          {!characterId && (
            <fieldset className="print-choices">
              <legend>Campaign sheets</legend>
              <label>
                <input type="checkbox" checked={game} onChange={(e) => setGame(e.target.checked)} />
                Game creation worksheet
              </label>
              <label>
                <input type="checkbox" checked={table} onChange={(e) => setTable(e.target.checked)} />
                Table worksheet
              </label>
            </fieldset>
          )}
          <fieldset className="print-choices">
            <legend>Character sheets</legend>
            <div className="print-selection-actions">
              <button
                onClick={() => setSelected(c.characters.filter((ch) => ch.kind === 'pc').map((ch) => ch.id))}
              >
                Select party
              </button>
              <button onClick={() => setSelected([])}>Clear selection</button>
            </div>
            {c.characters.map((ch) => (
              <label key={ch.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(ch.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked ? [...ids, ch.id] : ids.filter((id) => id !== ch.id),
                    )
                  }
                />
                {ch.name}
                {ch.kind !== 'pc' && <small>NPC{ch.visibility === 'gm' ? ' · GM only' : ''}</small>}
              </label>
            ))}
            {!c.characters.length && <p>No characters are available for this audience.</p>}
          </fieldset>
          <label className="print-detail-choice">
            <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
            Include character backstory &amp; notes
          </label>
          <p className="muted">
            Current stress, consequences and Fate points are included. Empty fields leave room for pencil
            notes. Long entries continue onto additional pages.
          </p>
          <p className="muted">
            Choose your printer or Save as PDF in the browser dialog. Use the selected paper size and 100%
            scale. Turn off “Headers and footers” to remove the browser’s title and web address. The sheet’s
            date, time and centered Fate Campaign Companion footer will remain.
          </p>
          {audience === 'gm' && !readOnly && (
            <p className="notice-text">GM copy: this packet includes private campaign material.</p>
          )}
          {readOnly && playerActor && (
            <p className="notice-text">
              Your copy can include private belongings for characters you control.
            </p>
          )}
          {printError && <p role="alert">{printError}</p>}
        </section>
        <p className="print-preview-label">
          {hasSheets
            ? 'Print preview · Each sheet starts on a new page'
            : 'Select at least one sheet to preview and print.'}
        </p>
      </div>
      <div className="print-preview-scroll" ref={preview}>
        <div
          className={`print-packet paper-${paper.toLowerCase()} orientation-${orientation}`}
          style={
            {
              '--sheet-width': `${width}mm`,
              '--sheet-height': `${height}mm`,
              zoom: previewWidth ? Math.min(1, previewWidth / ((width * 96) / 25.4)) : 1,
            } as React.CSSProperties
          }
          data-audience={audience === 'gm' && !readOnly ? 'gm' : 'shared'}
        >
          {!characterId && game && <GameWorksheet campaign={c} />}
          {characters.map((character) => (
            <CharacterSheet key={character.id} campaign={c} character={character} includeDetails={details} />
          ))}
          {!characterId && table && <TableWorksheet campaign={c} />}
        </div>
      </div>
    </div>
  );
}

export function PrintDialog({
  campaign,
  characterId,
  readOnly,
  playerActor,
  close,
}: {
  campaign: Campaign;
  characterId: string;
  readOnly?: boolean;
  playerActor?: Actor;
  close: () => void;
}) {
  useEffect(() => {
    document.body.classList.add('has-print-dialog');
    return () => document.body.classList.remove('has-print-dialog');
  }, []);
  return createPortal(
    <div className="print-dialog">
      <Modal title="Print character sheets" close={close} wide>
        <PrintSheets
          campaign={campaign}
          characterId={characterId}
          readOnly={readOnly}
          playerActor={playerActor}
          embedded
        />
      </Modal>
    </div>,
    document.body,
  );
}

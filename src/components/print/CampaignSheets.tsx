import { isAccelerated, ratingName } from '../../domain/editions';
import { playerName } from '../../domain/player-view';
import type { Campaign } from '../../domain/types';
import { deriveCharacter, LADDER } from '../../domain/rules';
import { signed } from '../../ui';
import { SheetFooter, SheetHeader, SheetSection, TextValue, WriteLines } from './SheetParts';

export function GameWorksheet({ campaign: c }: { campaign: Campaign }) {
  const r = c.rules;
  const faces = c.characters.filter((ch) => ch.kind !== 'pc');
  const places = c.world.filter((entry) => entry.kind === 'location' || entry.kind === 'faction');
  return (
    <article className="fate-sheet fs-game">
      <SheetHeader title="Game creation worksheet" subtitle={`${c.name} · ${r.name}`} />
      <div className="fs-labelled-box">
        <span>Game name</span>
        <TextValue>{c.name}</TextValue>
      </div>
      <div className="fs-labelled-box">
        <span>Setting / scale</span>
        <TextValue>{[c.setting, c.scale].filter(Boolean).join('\n')}</TextValue>
      </div>
      <SheetSection title="Issues">
        <div className="fs-issue-grid">
          {c.issues.length ? (
            c.issues.map((issue) => (
              <div className="fs-labelled-box" key={issue.id}>
                <span>Game issue{issue.visibility === 'gm' ? ' · GM only' : ''}</span>
                <TextValue>{issue.name}</TextValue>
                <WriteLines count={1} />
              </div>
            ))
          ) : (
            <>
              <div className="fs-labelled-box">
                <span>Current issue</span>
                <WriteLines count={2} />
              </div>
              <div className="fs-labelled-box">
                <span>Impending issue</span>
                <WriteLines count={2} />
              </div>
            </>
          )}
        </div>
      </SheetSection>
      <SheetSection title="Faces and places">
        <div className="fs-face-grid">
          {faces.map((ch) => (
            <div className="fs-labelled-box" key={ch.id}>
              <span>Face{ch.visibility === 'gm' ? ' · GM only' : ''}</span>
              <h3>{ch.name}</h3>
              {playerName(c, ch) && <small>{playerName(c, ch)}</small>}
              <TextValue>
                {ch.aspects
                  .map((a) => a.name)
                  .filter(Boolean)
                  .join('\n')}
              </TextValue>
            </div>
          ))}
          {places.map((place) => (
            <div className="fs-labelled-box" key={place.id}>
              <span>
                {place.kind}
                {place.visibility === 'gm' ? ' · GM only' : ''}
              </span>
              <h3>{place.title}</h3>
              <TextValue>{place.body}</TextValue>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 3 - faces.length - places.length) }, (_, i) => (
            <div className="fs-labelled-box" key={`blank-${i}`}>
              <span>Name / issue / aspect</span>
              <WriteLines count={3} />
            </div>
          ))}
        </div>
      </SheetSection>
      <div className="fs-game-columns">
        <SheetSection title="Dials">
          <dl className="fs-dials">
            <dt>Aspects / phases</dt>
            <dd>
              {isAccelerated(r) ? `3–${r.aspectCount}` : r.aspectCount} / {r.phaseCount}
            </dd>
            <dt>Starting {ratingName(r).toLowerCase()} cap</dt>
            <dd>
              {LADDER[r.skillCap]} ({signed(r.skillCap)})
            </dd>
            <dt>{ratingName(r)} allocation</dt>
            <dd>{r.allocation}</dd>
            <dt>Starting {ratingName(r).toLowerCase()} slots</dt>
            <dd>
              {Object.entries(r.skillSlots)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([rank, count]) => `${signed(Number(rank))}: ${count}`)
                .join(' · ')}
            </dd>
            <dt>Refresh / free stunts</dt>
            <dd>
              {r.refresh} / {r.freeStunts}
            </dd>
            <dt>Base stress boxes</dt>
            <dd>
              {r.stressTracks.map((track) => (
                <div key={track.id}>
                  {track.name}: {track.boxes.join(', ') || 'none'}
                </div>
              ))}
            </dd>
            <dt>Consequence slots</dt>
            <dd>{r.consequenceSlots.join(' / ') || 'None'}</dd>
          </dl>
        </SheetSection>
        <SheetSection title={ratingName(r, true)}>
          <div className="fs-skill-list">
            {r.skills.map((skill) => (
              <div key={skill.id}>{skill.name}</div>
            ))}
          </div>
        </SheetSection>
      </div>
      <SheetSection title="House rules, stunts and extras">
        <TextValue>{r.houseRules}</TextValue>
        <WriteLines count={2} />
      </SheetSection>
      <SheetFooter />
    </article>
  );
}

export function TableWorksheet({ campaign: c }: { campaign: Campaign }) {
  const notes = c.world.filter((entry) => entry.kind === 'note' || entry.kind === 'summary');
  return (
    <article className="fate-sheet fs-table">
      <SheetHeader title="At the table" subtitle={c.name} />
      <div className="fs-labelled-box">
        <span>Scenario / session / scene</span>
        <TextValue>
          {[c.play.scenarioName, c.play.sessionName, c.play.sceneName].filter(Boolean).join(' / ')}
        </TextValue>
      </div>
      <SheetSection title="The cast">
        <table className="fs-table-data">
          <thead>
            <tr>
              <th>Character</th>
              <th>High concept</th>
              <th>Fate</th>
              <th>Refresh</th>
            </tr>
          </thead>
          <tbody>
            {c.characters.map((ch) => (
              <tr key={ch.id}>
                <th>
                  {ch.name}
                  {playerName(c, ch) && <small>{playerName(c, ch)}</small>}
                  {ch.visibility === 'gm' && <small>GM only</small>}
                </th>
                <td>{ch.aspects.find((a) => a.kind === 'highConcept')?.name}</td>
                <td>{ch.kind === 'pc' ? ch.fatePoints : 'GM pool'}</td>
                <td>{ch.kind === 'pc' ? deriveCharacter(ch, c.rules).refresh : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!c.characters.length && <WriteLines count={3} />}
      </SheetSection>
      <SheetSection title="Scene aspects">
        <div className="fs-issue-grid">
          {c.play.aspects.map((a) => (
            <div className="fs-labelled-box" key={a.id}>
              <TextValue>{a.name}</TextValue>
              <span>
                {a.freeInvokes} free invocations{a.visibility === 'gm' ? ' · GM only' : ''}
              </span>
            </div>
          ))}
        </div>
        <WriteLines count={2} />
      </SheetSection>
      <SheetSection title="Inventory and treasure">
        <table className="fs-table-data">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Held by</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {c.inventory.map((item) => (
              <tr key={item.id}>
                <th>
                  {item.name}
                  {item.visibility === 'gm' && <small>GM only</small>}
                </th>
                <td>
                  {item.quantity} {item.unit}
                </td>
                <td>{c.characters.find((ch) => ch.id === item.ownerId)?.name || 'Party'}</td>
                <td>{item.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <WriteLines count={2} />
      </SheetSection>
      <SheetSection title="Session notes">
        {notes.map((note) => (
          <div className="fs-entry" key={note.id}>
            <h3>
              {note.title}
              {note.visibility === 'gm' ? ' · GM only' : ''}
            </h3>
            <TextValue>{note.body}</TextValue>
          </div>
        ))}
        <WriteLines count={4} />
      </SheetSection>
      <SheetFooter />
    </article>
  );
}

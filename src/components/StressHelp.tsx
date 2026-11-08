import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';
import type { Character } from '../domain/types';
import { coreRuleSource } from '../domain/rule-sources';
import { Modal } from '../ui';
import './StressHelp.css';

export function StressHelp({
  character,
  track,
  compact = false,
}: {
  character: Character;
  track: { id: string; name: string; boxes: number[] };
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = /\bstress\b/i.test(track.name) ? track.name : `${track.name} stress`;
  const marked = track.boxes.filter((box) => character.stress[track.id]?.includes(box));
  const available = track.boxes.filter((box) => !marked.includes(box));
  const shared = character.kind === 'nameless';
  const explanation = shared
    ? 'This nameless NPC shares one stress track for physical and mental hits, and has no consequence slots.'
    : track.id === 'physical'
      ? 'Physical stress represents temporary strain: getting winded, a glancing blow, or a desperate dodge.'
      : track.id === 'mental'
        ? 'Mental stress represents temporary pressure on your composure: fear, intimidation, humiliation, or keeping your nerve.'
        : `${track.name} stress represents temporary strain from the kind of pressure this track covers.`;
  const source = coreRuleSource('harm');
  return (
    <>
      <button
        type="button"
        className={`stress-help-trigger${compact ? ' compact' : ''}`}
        aria-label={`${label} help for ${character.name}`}
        aria-haspopup="dialog"
        title="What do these boxes mean? Click for stress help."
        onClick={() => setOpen(true)}
      >
        {compact ? track.name : label}
        <CircleHelp size={14} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <Modal title={label} close={() => setOpen(false)}>
            <div className="stress-help-content">
              <p>{explanation}</p>
              <section className="stress-help-current" aria-label={`${character.name}'s current stress`}>
                <h3>{character.name} right now</h3>
                <p>
                  {track.boxes.length
                    ? `${marked.length} of ${track.boxes.length} boxes marked. Available box values: ${available.length ? available.join(', ') : 'none'}.`
                    : 'No stress boxes on this track.'}
                </p>
                <p>
                  {character.takenOut
                    ? 'Already taken out of this conflict. Unused stress does not undo that outcome.'
                    : character.conceded
                      ? 'Already conceded this conflict. Remaining boxes do not put this character back in it.'
                      : !available.length
                        ? shared
                          ? 'No stress or consequences remain to absorb another hit. A successful hit takes this NPC out.'
                          : 'No stress remains to absorb another hit. Available consequences can still keep this character in the conflict.'
                        : `One remaining box can absorb up to ${Math.max(...available)} shifts from a hit. Marked boxes leave fewer options for later hits.`}
                </p>
              </section>
              <h3>What marked boxes mean</h3>
              <p>
                Marking stress uses up a short-term reserve. It imposes no automatic skill penalty and does
                not, by itself, mean an injury or a lasting condition. Existing consequences still matter.
              </p>
              <p>
                Each box absorbs its printed value in shifts. Use at most one box per hit: boxes 1 and 2
                cannot combine to absorb 3. You can combine one box with consequences to cover a larger hit.
              </p>
              <h3>When the boxes run out</h3>
              <p>
                A full track does not automatically take you out. If you cannot or choose not to absorb an
                entire hit with available stress and consequences, you are taken out of the conflict. You can
                instead negotiate a concession before the next roll.
              </p>
              <h3>Getting a breather</h3>
              <p>
                Stress clears after the conflict when the character has a chance to catch their breath.
                Consequences are lasting setbacks with their own recovery requirements.
              </p>
              <a href={source.url} target="_blank" rel="noreferrer">
                Read the Fate Core stress and consequences rules
              </a>
            </div>
            <div className="modal-actions">
              <button className="button-primary" onClick={() => setOpen(false)}>
                Got it
              </button>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}

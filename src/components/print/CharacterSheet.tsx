import type { Campaign, Character, Consequence } from '../../domain/types';
import { deriveCharacter, LADDER } from '../../domain/rules';
import { SheetFooter, SheetHeader, SheetSection, TextValue, WriteLines } from './SheetParts';

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value}`;
const aspectLabel = {
  highConcept: 'High concept',
  trouble: 'Trouble',
  character: 'Other aspect',
  game: 'Game aspect',
  situation: 'Situation aspect',
  consequence: 'Consequence aspect',
  boost: 'Boost',
};
const consequenceLabels: Record<number, string> = { 2: 'Mild', 4: 'Moderate', 6: 'Severe', 8: 'Extreme' };
const consequenceLabel = (value: number) => consequenceLabels[value] || 'Consequence';

/** The caller supplies the selected audience's campaign, including filtered assets and links. */
export function CharacterSheet({
  campaign,
  character,
  includeDetails,
}: {
  campaign: Campaign;
  character: Character;
  includeDetails: boolean;
}) {
  const ch = character;
  const { rules } = campaign;
  const stats = deriveCharacter(ch, rules);
  const owner = campaign.members.find((member) => member.id === ch.ownerId);
  const portrait = campaign.assets.find((asset) => asset.id === ch.portraitAssetId);
  const skillName = (skill: string) => rules.skills.find((entry) => entry.id === skill)?.name || skill;
  const trackName = (trackId: string) => stats.tracks.find((track) => track.id === trackId)?.name || trackId;
  const ranks = [
    ...new Set([
      ...Object.values(ch.skills).filter((rank) => rank > 0),
      ...Object.keys(rules.skillSlots)
        .map(Number)
        .filter((rank) => rank > 0),
    ]),
  ].sort((a, b) => b - a);
  const assigned = Object.entries(ch.skills).filter(([, rank]) => rank > 0);
  // House rules can define several slots of the same capacity. Each recorded injury
  // belongs to one slot, and injuries left over after a rules change must remain visible.
  const used = new Set<number>();
  const slots = stats.consequenceSlots.map((slot) => {
    const index = ch.consequences.findIndex(
      (consequence, i) =>
        !used.has(i) && consequence.value === slot.value && consequence.trackId === slot.trackId,
    );
    if (index >= 0) used.add(index);
    return { ...slot, consequence: index >= 0 ? ch.consequences[index] : undefined };
  });
  const unmatched = ch.consequences.filter((_, index) => !used.has(index));
  const inventory = campaign.inventory.filter((item) => item.ownerId === ch.id);
  const injury = (consequence?: Consequence) =>
    consequence ? (
      <>
        <TextValue>{consequence.name}</TextValue>
        {consequence.recovering && <small className="fs-recovery">Recovery started</small>}
      </>
    ) : (
      <WriteLines count={1} />
    );

  return (
    <div className="character-print">
      <article className="fate-sheet fs-character-sheet">
        <SheetHeader title={ch.name || 'Character sheet'} subtitle={`${campaign.name} · ${rules.name}`} />
        <div className="fs-identity">
          <div className="fs-identity-copy">
            <dl className="fs-identity-fields">
              <div>
                <dt>Player</dt>
                <dd>
                  <TextValue>{owner?.name}</TextValue>
                </dd>
              </div>
              <div>
                <dt>Pronouns</dt>
                <dd>
                  <TextValue>{ch.pronouns}</TextValue>
                </dd>
              </div>
            </dl>
            <div className="fs-description">
              <span className="fs-label">Description</span>
              <TextValue>{ch.description}</TextValue>
            </div>
          </div>
          {portrait && <img className="fs-portrait" src={portrait.dataUrl} alt={`Portrait of ${ch.name}`} />}
          <dl className="fs-counters">
            <div>
              <dt>{ch.kind === 'pc' ? 'Refresh' : 'NPC'}</dt>
              <dd>{ch.kind === 'pc' ? stats.refresh : 'GM'}</dd>
            </div>
            {ch.kind === 'pc' && (
              <div>
                <dt>Current Fate</dt>
                <dd>{ch.fatePoints}</dd>
              </div>
            )}
          </dl>
        </div>
        <p className="fs-status">
          {ch.kind === 'pc' ? 'Protagonist' : `${ch.kind.charAt(0).toUpperCase()}${ch.kind.slice(1)} NPC`}
          {' · '}
          {ch.status === 'ready' ? 'Ready to play' : 'In progress'}
          {ch.takenOut && ' · Taken out'}
          {ch.conceded && ' · Conceded'}
          {ch.extremeUsed && ' · Extreme consequence used this major milestone'}
          {ch.kind !== 'pc' && ' · Uses the GM’s NPC Fate-point pool'}
        </p>
        <div className="fs-character-columns">
          <SheetSection title="Aspects" className="fs-aspects">
            {ch.aspects.map((aspect) => (
              <div className="fs-aspect fs-entry" key={aspect.id}>
                <span className="fs-label">{aspectLabel[aspect.kind]}</span>
                <TextValue>{aspect.name}</TextValue>
                {aspect.freeInvokes > 0 && (
                  <small>
                    {aspect.freeInvokes} free invocation{aspect.freeInvokes === 1 ? '' : 's'}
                  </small>
                )}
              </div>
            ))}
            {!ch.aspects.length && <WriteLines count={3} />}
          </SheetSection>
          <SheetSection title="Skills" className="fs-skills">
            <table className="fs-skill-table">
              <tbody>
                {ranks.map((rank) => (
                  <tr key={rank}>
                    <th scope="row">
                      {LADDER[rank] || 'Rating'} <span>({signed(rank)})</span>
                    </th>
                    <td>
                      <TextValue>
                        {assigned
                          .filter(([, value]) => value === rank)
                          .map(([skill]) => skillName(skill))
                          .join(', ')}
                      </TextValue>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fs-small">Unranked skills: Mediocre (+0).</p>
            <p className="fs-small">Banked skill points: {ch.bankedSkillPoints}</p>
          </SheetSection>
        </div>
        <SheetSection title="Stunts" className="fs-stunts">
          {ch.stunts.map((stunt) => (
            <div className="fs-entry fs-stunt" key={stunt.id}>
              <h3>{stunt.name || 'Unnamed stunt'}</h3>
              <TextValue>{stunt.description}</TextValue>
              <p className="fs-small">
                Activation: {stunt.fateCost} Fate point{stunt.fateCost === 1 ? '' : 's'}
                {stunt.limit !== 'none' && ` · ${stunt.uses}/${stunt.maxUses} uses spent this ${stunt.limit}`}
              </p>
            </div>
          ))}
          {!ch.stunts.length && <WriteLines count={2} />}
        </SheetSection>
        <SheetSection title="Extras" className="fs-extras">
          <TextValue>{ch.extras}</TextValue>
        </SheetSection>
        <SheetSection title="Stress & consequences" className="fs-durability">
          <div className="fs-stress-tracks">
            {stats.tracks.map((track) => {
              const definition = rules.stressTracks.find((entry) => entry.id === track.id);
              return (
                <div key={track.id} className="fs-stress-track fs-entry">
                  <h3>
                    {track.name}
                    {definition && <small> ({skillName(definition.skillId)})</small>}
                  </h3>
                  <div className="fs-stress-boxes">
                    {track.boxes.map((rating) => {
                      const marked = ch.stress[track.id]?.includes(rating);
                      return (
                        <span
                          className={`fs-stress-box${marked ? ' marked' : ''}`}
                          key={rating}
                          data-stress-value={rating}
                          data-marked={!!marked}
                          aria-label={`${track.name} ${rating}: ${marked ? 'marked' : 'available'}`}
                        >
                          <span className="fs-box-rating">{rating}</span>
                          <span className="fs-box-mark">{marked ? '×' : ''}</span>
                        </span>
                      );
                    })}
                    {!track.boxes.length && <span className="fs-small">No stress boxes</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="fs-consequences">
            {slots.map((slot, index) => (
              <div className="fs-consequence fs-entry" key={index}>
                <span className="fs-consequence-rating">{slot.value}</span>
                <div>
                  <span className="fs-label">
                    {consequenceLabel(slot.value)}
                    {slot.trackId && ` · ${trackName(slot.trackId)} only`}
                  </span>
                  {injury(slot.consequence)}
                </div>
              </div>
            ))}
            {unmatched.map((consequence) => (
              <div className="fs-consequence fs-entry" key={consequence.id}>
                <span className="fs-consequence-rating">{consequence.value}</span>
                <div>
                  <span className="fs-label">
                    {consequenceLabel(consequence.value)}
                    {consequence.trackId && ` · ${trackName(consequence.trackId)}`}
                    {consequence.value !== 8 && ' · Recorded injury'}
                  </span>
                  {injury(consequence)}
                </div>
              </div>
            ))}
            {!slots.length && !unmatched.length && <p className="fs-small">No consequence slots.</p>}
          </div>
        </SheetSection>
        <SheetFooter />
      </article>
      {includeDetails && (
        <article className="fate-sheet fs-character-details">
          <SheetHeader title={`${ch.name || 'Character'} · Story & belongings`} subtitle={campaign.name} />
          <SheetSection title="Backstory & connections">
            {ch.phases.map((phase, index) => (
              <div className="fs-entry fs-phase" key={phase.id}>
                <h3>Phase {index + 1}</h3>
                <TextValue>{phase.story}</TextValue>
                {phase.characterIds.length > 0 && (
                  <p className="fs-small">
                    Connections:{' '}
                    {phase.characterIds
                      .map((id) => campaign.characters.find((other) => other.id === id)?.name)
                      .filter(Boolean)
                      .join(', ') || 'Unassigned'}
                  </p>
                )}
              </div>
            ))}
            {!ch.phases.length && <WriteLines count={3} />}
          </SheetSection>
          <SheetSection title="Personal inventory">
            {inventory.length ? (
              <table className="fs-inventory-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">{item.name}</th>
                      <td>
                        {item.quantity} {item.unit}
                      </td>
                      <td>
                        <TextValue>{item.description}</TextValue>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <WriteLines count={3} />
            )}
          </SheetSection>
          <SheetSection title="Notes">
            <TextValue>{ch.notes}</TextValue>
            <WriteLines count={3} />
          </SheetSection>
          <SheetSection title="Advancement">
            <p className="fs-small">Banked skill points: {ch.bankedSkillPoints}</p>
            {ch.milestones.map((milestone) => (
              <div className="fs-entry fs-milestone" key={milestone.id}>
                <h3>{milestone.type.charAt(0).toUpperCase() + milestone.type.slice(1)} milestone</h3>
                <TextValue>{milestone.description}</TextValue>
                <p className="fs-small">
                  {milestone.timestamp.slice(0, 10)} ·{' '}
                  {milestone.choiceUsed ? 'Milestone choice used' : 'Milestone choice available'}
                </p>
              </div>
            ))}
            {!ch.milestones.length && <WriteLines count={2} />}
          </SheetSection>
          <SheetFooter />
        </article>
      )}
    </div>
  );
}

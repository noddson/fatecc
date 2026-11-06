import { useState } from 'react';
import { Check, Plus, Settings2 } from 'lucide-react';
import { CORE_RULES, id } from '../domain/defaults';
import { validateCharacter } from '../domain/rules';
import type { RuleSetDefinition } from '../domain/types';
import { Badge, ConfirmButton, Field, Modal, PageTitle, downloadFile, slug, type EditorProps } from '../ui';
import { exportRules, parseRulesExport } from '../storage/backup';
export function RulesSettings({ campaign: c, update, notify, readOnly }: EditorProps) {
  const [r, setR] = useState<RuleSetDefinition>(structuredClone(c.rules));
  const [preview, setPreview] = useState(false);
  const change = <K extends keyof RuleSetDefinition>(key: K, value: RuleSetDefinition[K]) =>
    setR((prev) => ({
      ...prev,
      [key]: value,
      ...(key === 'skillCap'
        ? {
            skillSlots: Object.fromEntries(
              Object.entries(prev.skillSlots).filter(([rank]) => Number(rank) <= Number(value)),
            ),
          }
        : {}),
    }));
  const numbers: [keyof RuleSetDefinition, string, number, number][] = [
    ['aspectCount', 'Character aspects', 2, 12],
    ['phaseCount', 'Backstory phases', 0, 10],
    ['skillCap', 'Starting skill cap', 1, 10],
    ['refresh', 'Starting refresh', 1, 20],
    ['freeStunts', 'Free stunts', 0, 20],
  ];
  const changed = JSON.stringify(r) !== JSON.stringify(c.rules);
  return (
    <>
      <PageTitle
        eyebrow="Game definition"
        title="Make Fate your own"
        text="A verified Core foundation, with room for your world’s rules."
        actions={
          <>
            <button
              onClick={() =>
                void exportRules(r)
                  .then((text) => downloadFile(text, `${slug(c.name)}-rules.json`))
                  .catch((e) => notify(e.message, true))
              }
            >
              Export rules
            </button>
            {!readOnly && (
              <label className="button">
                Import rules
                <input
                  hidden
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void f
                        .text()
                        .then(parseRulesExport)
                        .then(setR)
                        .catch((e) => notify(e.message, true));
                  }}
                />
              </label>
            )}
          </>
        }
      />
      <div className="notice">
        <Settings2 size={20} />
        <div>
          <strong>Changes belong to this campaign.</strong>
          <p>
            Review their effect before applying. Existing character choices and historical rolls are
            preserved. Core uses rated stress boxes and the four actions throughout.
          </p>
        </div>
        <Badge>Revision {c.rules.version}</Badge>
      </div>
      <fieldset disabled={readOnly} className="unframed">
        <div className="two-columns">
          <section className="panel">
            <h2>Character creation</h2>
            <Field label="Ruleset name">
              <input value={r.name} onChange={(e) => change('name', e.target.value)} />
            </Field>
            <div className="form-grid">
              {numbers.map(([key, label, min, max]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={Number(r[key])}
                    onChange={(e) =>
                      change(key, Math.max(min, Math.min(max, Number(e.target.value))) as never)
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label="Skill allocation">
              <select
                value={r.allocation}
                onChange={(e) => change('allocation', e.target.value as 'pyramid' | 'columns')}
              >
                <option value="pyramid">Pyramid</option>
                <option value="columns">Columns</option>
              </select>
            </Field>
            <p className="muted">Starting slots at each rating</p>
            <div className="slot-grid">
              {Array.from({ length: r.skillCap }, (_, i) => i + 1).map((rank) => (
                <Field key={rank} label={`+${rank}`}>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={r.skillSlots[rank] || 0}
                    onChange={(e) =>
                      change('skillSlots', { ...r.skillSlots, [rank]: Math.max(0, Number(e.target.value)) })
                    }
                  />
                </Field>
              ))}
            </div>
          </section>
          <section className="panel stress-settings">
            <h2>Stress & consequences</h2>
            {r.stressTracks.map((track, i) => (
              <div className="subpanel" key={track.id}>
                <div className="inline-form">
                  <Field label="Track name">
                    <input
                      value={track.name}
                      onChange={(e) =>
                        change(
                          'stressTracks',
                          r.stressTracks.map((t, k) => (k === i ? { ...t, name: e.target.value } : t)),
                        )
                      }
                    />
                  </Field>
                  <ConfirmButton
                    title="Remove this stress track?"
                    onConfirm={() =>
                      change(
                        'stressTracks',
                        r.stressTracks.filter((t) => t.id !== track.id),
                      )
                    }
                  />
                </div>
                <div className="form-grid">
                  <Field label="Governing skill">
                    <select
                      value={track.skillId}
                      onChange={(e) =>
                        change(
                          'stressTracks',
                          r.stressTracks.map((t, k) => (k === i ? { ...t, skillId: e.target.value } : t)),
                        )
                      }
                    >
                      {r.skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Base rated boxes" hint="A comma-separated list, such as 1, 2.">
                    <input
                      defaultValue={track.boxes.join(', ')}
                      key={`${track.id}-boxes-${track.boxes.join(',')}`}
                      onBlur={(e) => {
                        const boxes = e.target.value
                          .split(',')
                          .map(Number)
                          .filter((n) => Number.isInteger(n) && n > 0 && n <= 20);
                        if (boxes.length)
                          change(
                            'stressTracks',
                            r.stressTracks.map((t, k) => (k === i ? { ...t, boxes } : t)),
                          );
                      }}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              onClick={() =>
                change('stressTracks', [
                  ...r.stressTracks,
                  { id: id(), name: 'New track', skillId: r.skills[0]?.id || 'will', boxes: [1, 2] },
                ])
              }
            >
              <Plus size={15} />
              Add track
            </button>
            <Field label="Consequence capacities" hint="Core: 2, 4, 6. Slots are shared across harm types.">
              <input
                key={`${r.id}-${r.consequenceSlots.join(',')}`}
                defaultValue={r.consequenceSlots.join(', ')}
                onBlur={(e) => {
                  const slots = e.target.value
                    .split(',')
                    .map(Number)
                    .filter((n) => Number.isInteger(n) && n > 0 && n <= 20);
                  if (slots.length) change('consequenceSlots', slots);
                }}
              />
            </Field>
          </section>
        </div>
        <section className="panel">
          <div className="section-heading">
            <h2>Skills in your setting</h2>
            <button
              onClick={() =>
                change('skills', [
                  ...r.skills,
                  { id: id(), name: 'New skill', description: '', actions: ['overcome', 'advantage'] },
                ])
              }
            >
              <Plus size={15} />
              Add skill
            </button>
          </div>
          <div className="skills-config">
            {r.skills.map((s, i) => (
              <div className="skill-config" key={s.id}>
                <input
                  aria-label={`Skill ${i + 1} name`}
                  value={s.name}
                  onChange={(e) =>
                    change(
                      'skills',
                      r.skills.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <input
                  aria-label={`${s.name} description`}
                  placeholder="What does this skill do?"
                  value={s.description}
                  onChange={(e) =>
                    change(
                      'skills',
                      r.skills.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
                <ConfirmButton
                  title={`Remove ${s.name}?`}
                  onConfirm={() => {
                    if (r.stressTracks.some((t) => t.skillId === s.id)) {
                      notify(
                        'Assign another governing skill to the stress track before removing this skill.',
                        true,
                      );
                      return;
                    }
                    change(
                      'skills',
                      r.skills.filter((x) => x.id !== s.id),
                    );
                  }}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>House rules & fictional permissions</h2>
          <Field
            label="Table agreement"
            hint="Record custom magic, equipment, permissions, or other rulings. These notes are not executable rules."
          >
            <textarea rows={5} value={r.houseRules} onChange={(e) => change('houseRules', e.target.value)} />
          </Field>
        </section>
        <div className="sticky-actions">
          <button onClick={() => setR({ ...structuredClone(CORE_RULES), version: c.rules.version })}>
            Use Core defaults
          </button>
          <span className="muted">{changed ? 'Unapplied changes' : 'Up to date'}</span>
          <button className="button-primary" disabled={!changed} onClick={() => setPreview(true)}>
            Review changes <Check size={16} />
          </button>
        </div>
      </fieldset>
      {preview && (
        <Modal wide title="Review rules changes" close={() => setPreview(false)}>
          <p>
            A new rules revision will be saved. Character choices remain intact; their validation and derived
            values will use these settings.
          </p>
          <div className="validation-list">
            {c.characters.map((ch) => {
              const problems = validateCharacter(ch, r);
              return (
                <div key={ch.id}>
                  <strong>{ch.name}</strong>
                  <p>
                    {problems.length
                      ? problems.map((p) => p.message).join(' · ')
                      : 'Valid under this configuration'}
                  </p>
                </div>
              );
            })}
            {!c.characters.length && <p>No characters to revalidate yet.</p>}
          </div>
          <div className="modal-actions">
            <button onClick={() => setPreview(false)}>Keep editing</button>
            <button
              className="button-primary"
              onClick={() => {
                const next = { ...r, id: r.id === CORE_RULES.id ? id() : r.id, version: c.rules.version + 1 };
                void update((d) => {
                  d.rules = next;
                }).then((ok) => {
                  if (ok) {
                    setR(next);
                    setPreview(false);
                  }
                });
              }}
            >
              Apply revision {c.rules.version + 1}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

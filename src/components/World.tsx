import { useState } from 'react';
import { BookOpen, EyeOff, Package, Plus, Search } from 'lucide-react';
import { id } from '../domain/defaults';
import { removeInventoryItem, saveInventoryItem } from '../domain/inventory';
import type { InventoryItem, WorldEntry } from '../domain/types';
import { AddButton, Badge, ConfirmButton, Empty, Field, Modal, PageTitle, type EditorProps } from '../ui';
export function World({ campaign: c, update, readOnly }: EditorProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [editing, setEditing] = useState<WorldEntry>();
  const [baseline, setBaseline] = useState<string>();
  const entries = c.world.filter(
    (e) =>
      (kind === 'all' || e.kind === kind) &&
      `${e.title} ${e.body} ${e.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  );
  const add = () => {
    setBaseline(undefined);
    setEditing({ id: id(), kind: 'note', title: '', body: '', visibility: 'gm', tags: [] });
  };
  return (
    <>
      <PageTitle
        eyebrow="The living world"
        title="Keep the threads together"
        text="Places, people, discoveries, and the details worth remembering."
        actions={!readOnly && <AddButton onClick={add}>New entry</AddButton>}
      />
      <div className="filter-bar">
        <div className="search-input">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your campaign journal…"
            aria-label="Search journal"
          />
        </div>
        <select aria-label="Entry type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All entries</option>
          {['note', 'location', 'faction', 'summary', 'reference'].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="journal-grid">
        {entries.map((entry) => (
          <article className="panel journal-card" key={entry.id}>
            <div className="section-heading">
              <Badge>{entry.kind}</Badge>
              {entry.visibility === 'gm' && (
                <span className="private-label">
                  <EyeOff size={13} />
                  GM only
                </span>
              )}
            </div>
            <h2>{entry.title}</h2>
            <p className="prose">{entry.body}</p>
            <div className="tags">
              {entry.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            {!readOnly && (
              <div className="card-footer">
                <button
                  className="button-text"
                  onClick={() => {
                    setBaseline(JSON.stringify(entry));
                    setEditing(structuredClone(entry));
                  }}
                >
                  Edit entry
                </button>
                <ConfirmButton
                  title={`Delete ${entry.title}?`}
                  onConfirm={() =>
                    void update((d) => {
                      d.world = d.world.filter((w) => w.id !== entry.id);
                    })
                  }
                />
              </div>
            )}
          </article>
        ))}
      </div>
      {!entries.length && (
        <Empty
          icon={<BookOpen size={30} />}
          title="Every detail can become a story"
          text="Keep your private preparation and shared discoveries in one place."
          action={!readOnly && <AddButton onClick={add}>Write your first entry</AddButton>}
        />
      )}
      {editing && (
        <Modal
          wide
          title={c.world.some((e) => e.id === editing.id) ? 'Edit journal entry' : 'A new thread'}
          close={() => setEditing(undefined)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const entry = editing;
              void update((d) => {
                const index = d.world.findIndex((w) => w.id === entry.id);
                if (baseline !== undefined && (index < 0 || JSON.stringify(d.world[index]) !== baseline))
                  throw new Error(
                    'This journal entry changed in another window. Reopen it to compare the latest text.',
                  );
                if (index >= 0) d.world[index] = entry;
                else d.world.push(entry);
              }).then((ok) => {
                if (ok) setEditing(undefined);
              });
            }}
          >
            <Field label="Title">
              <input
                required
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Type">
                <select
                  value={editing.kind}
                  onChange={(e) => setEditing({ ...editing, kind: e.target.value as WorldEntry['kind'] })}
                >
                  {['note', 'location', 'faction', 'summary', 'reference'].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </Field>
              <Field label="Who can see this?">
                <select
                  value={editing.visibility}
                  onChange={(e) => setEditing({ ...editing, visibility: e.target.value as 'shared' | 'gm' })}
                >
                  <option value="gm">GM only</option>
                  <option value="shared">Everyone at the table</option>
                </select>
              </Field>
            </div>
            <Field label="The details">
              <textarea
                rows={10}
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              />
            </Field>
            <Field label="Tags" hint="Separate tags with commas.">
              <input
                value={editing.tags.join(', ')}
                onChange={(e) =>
                  setEditing({ ...editing, tags: e.target.value.split(',').map((t) => t.trim()) })
                }
              />
            </Field>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
              <button className="button-primary">Save entry</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Inventory({ campaign: c, update, readOnly }: EditorProps) {
  const [editing, setEditing] = useState<InventoryItem>();
  const add = () =>
    setEditing({
      id: id(),
      revision: 0,
      name: '',
      quantity: 1,
      unit: 'item',
      ownerId: 'party',
      description: '',
      visibility: 'shared',
    });
  const ownerName = (owner: string) =>
    owner === 'party'
      ? 'Shared party inventory'
      : c.characters.find((ch) => ch.id === owner)?.name || 'Unassigned';
  const save = (item: InventoryItem) => update((d) => saveInventoryItem(d, item));
  const needsCharacter =
    editing?.visibility === 'character' &&
    !c.characters.some((character) => character.id === editing.ownerId);
  return (
    <>
      <PageTitle
        eyebrow="What you carry"
        title="Treasures & loose ends"
        text="Shared supplies, meaningful objects, and things someone really should keep track of."
        actions={!readOnly && <AddButton onClick={add}>Add item</AddButton>}
      />
      <div className="notice">
        <Package size={20} />
        <p>
          Equipment is narrative by default. An important object can also be an aspect or extra. Quantities
          and custom currencies do not automatically change the Resources skill.
        </p>
      </div>
      <section className="panel table-panel">
        {c.inventory.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Held by</th>
                  <th>Visibility</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.inventory.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small>{item.description}</small>
                    </td>
                    <td>
                      {item.quantity} <span className="muted">{item.unit}</span>
                    </td>
                    <td>{ownerName(item.ownerId)}</td>
                    <td>
                      <Badge>
                        {item.visibility === 'gm'
                          ? 'GM only'
                          : item.visibility === 'character'
                            ? 'Character'
                            : 'Shared'}
                      </Badge>
                    </td>
                    <td>
                      {!readOnly && (
                        <div className="actions">
                          <button onClick={() => setEditing(structuredClone(item))}>Edit / transfer</button>
                          <ConfirmButton
                            title={`Remove ${item.name}?`}
                            onConfirm={() => void update((d) => removeInventoryItem(d, item))}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<Package size={30} />}
            title="Travel light, for now"
            text="Add shared supplies, personal possessions, or a mysterious object from the last adventure."
          />
        )}
      </section>
      {editing && (
        <Modal title="Inventory item" close={() => setEditing(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save(editing).then((ok) => {
                if (ok) setEditing(undefined);
              });
            }}
          >
            <Field label="Name">
              <input
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Quantity">
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={editing.quantity}
                  onChange={(e) => setEditing({ ...editing, quantity: Number(e.target.value) })}
                />
              </Field>
              <Field label="Unit">
                <input
                  value={editing.unit}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Held by">
              <select
                value={editing.ownerId}
                onChange={(e) => setEditing({ ...editing, ownerId: e.target.value })}
              >
                <option value="party">Shared party inventory</option>
                {c.characters.map((ch) => (
                  <option value={ch.id} key={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description / permissions">
              <textarea
                rows={4}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <Field
              label="Visibility"
              hint={
                editing.visibility === 'character'
                  ? 'Visible only to this character’s assigned player and the GM.'
                  : undefined
              }
            >
              <select
                value={editing.visibility}
                onChange={(e) =>
                  setEditing({ ...editing, visibility: e.target.value as InventoryItem['visibility'] })
                }
              >
                <option value="shared">Shared</option>
                <option value="character">Character</option>
                <option value="gm">GM only</option>
              </select>
            </Field>
            {needsCharacter && (
              <p className="notice-text" role="status">
                Choose a character under Held by to use Character visibility.
              </p>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
              <button className="button-primary" disabled={needsCharacter}>
                Save item
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

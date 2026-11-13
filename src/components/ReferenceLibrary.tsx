import { useMemo, useState } from 'react';
import { BookOpen, ChevronRight, Search, ShieldCheck, Plus } from 'lucide-react';
import {
  campaignReferences,
  createReferenceSearch,
  referencesForRules,
  metadataForRules,
  referenceCategories,
} from '../content/reference';
import { systemName, ratingName } from '../domain/editions';
import { id } from '../domain/defaults';
import type { ReferenceEntry, Visibility } from '../domain/types';
import { Badge, Empty, Field, Modal, PageTitle, type EditorProps } from '../ui';
import './ReferenceLibrary.css';

function excerpt(entry: ReferenceEntry, query: string): string {
  const text = entry.body.replace(/\s+/g, ' ');
  const term = query.trim().split(/\s+/)[0]?.toLowerCase();
  const at = term ? text.toLowerCase().indexOf(term) : -1;
  const start = at > 70 ? at - 55 : 0;
  return `${start ? '…' : ''}${text.slice(start, start + 190)}${text.length > start + 190 ? '…' : ''}`;
}

export function ReferenceLibrary({ campaign, update, notify, readOnly }: EditorProps) {
  const metadata = metadataForRules(campaign.rules);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All references');
  const [selected, setSelected] = useState<ReferenceEntry>();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('gm');
  const [saving, setSaving] = useState(false);
  const entries = useMemo(
    () => [...referencesForRules(campaign.rules), ...campaignReferences(campaign.world)],
    [campaign.world, campaign.rules],
  );
  const search = useMemo(() => createReferenceSearch(entries), [entries]);
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const categories = useMemo(() => ['All references', ...referenceCategories(entries)], [entries]);
  const matching = useMemo(
    () =>
      (query.trim()
        ? search
            .search(query)
            .map((result) => byId.get(String(result.id))!)
            .filter(Boolean)
        : entries
      ).filter((entry) => category === 'All references' || entry.category === category),
    [query, search, byId, entries, category],
  );
  const [limit, setLimit] = useState(24);

  async function saveReference() {
    if (!title.trim() || !body.trim()) {
      notify('Give this reference a title and some text.', true);
      return;
    }
    setSaving(true);
    try {
      const saved = await update((draft) => {
        draft.world.push({
          id: id(),
          title: title.trim(),
          body: body.trim(),
          kind: 'reference',
          visibility,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        });
      });
      if (!saved) return;
      setCreating(false);
      setTitle('');
      setBody('');
      setTags('');
      setCategory('Campaign references');
      setQuery('');
      notify('Campaign reference saved.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save this reference.', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageTitle
        eyebrow="The reference library"
        title="A little clarity, a lot of possibility."
        text={`${systemName(campaign.rules)} rules from the official SRD repository, available offline.`}
        actions={
          !readOnly && (
            <button className="button-primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Add reference
            </button>
          )
        }
      />
      {campaign.rules.contentVersion !== metadata.version && (
        <aside className="reference-version-notice" aria-label="Reference edition notice">
          <strong>This campaign was saved with a different reference edition.</strong>
          <p>
            You are browsing the bundled GitHub edition. Your campaign’s saved rule settings and play history
            retain their original version.
          </p>
          <dl>
            <div>
              <dt>Campaign reference edition</dt>
              <dd>{campaign.rules.contentVersion}</dd>
            </div>
            <div>
              <dt>Library reference edition</dt>
              <dd>{metadata.version}</dd>
            </div>
          </dl>
        </aside>
      )}
      <div className="reference-search-bar">
        <Search size={21} aria-hidden="true" />
        <input
          aria-label="Search rules and references"
          type="search"
          value={query}
          placeholder={`Search ${ratingName(campaign.rules, true).toLowerCase()}, stunts, aspects, or a rule…`}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(24);
          }}
        />
        <Badge>
          <ShieldCheck size={13} />
          Available offline
        </Badge>
      </div>
      <div className="reference-layout">
        <aside className="reference-filters" aria-label="Reference categories">
          <p className="eyebrow">Browse the library</p>
          {categories.map((name) => (
            <button
              key={name}
              className={category === name ? 'reference-filter active' : 'reference-filter'}
              aria-pressed={category === name}
              onClick={() => {
                setCategory(name);
                setLimit(24);
              }}
            >
              <span>{name}</span>
              <span className="reference-count">
                {name === 'All references'
                  ? entries.length
                  : entries.filter((entry) => entry.category === name).length}
              </span>
            </button>
          ))}
          <div className="reference-source-note">
            <BookOpen size={21} />
            <strong>A shared foundation</strong>
            <p>
              The selected system’s rules stay distinct from the stories and house rules you add to this
              campaign.
            </p>
          </div>
        </aside>
        <section className="reference-results" aria-label="Reference results">
          <div className="section-heading">
            <h2>
              {category === 'All references'
                ? query
                  ? 'Search results'
                  : systemName(campaign.rules)
                : category}
            </h2>
            <span className="muted" role="status">
              {matching.length} {matching.length === 1 ? 'reference' : 'references'}
            </span>
          </div>
          {matching.length ? (
            <>
              <div className="reference-grid">
                {matching.slice(0, limit).map((entry) => (
                  <button className="reference-card" key={entry.id} onClick={() => setSelected(entry)}>
                    <span className="reference-card-top">
                      <span className="eyebrow">{entry.category}</span>
                      <ChevronRight size={17} />
                    </span>
                    <h3>{entry.title}</h3>
                    <p>{excerpt(entry, query)}</p>
                    <span className="reference-source">{entry.source}</span>
                  </button>
                ))}
              </div>
              {matching.length > limit && (
                <div className="reference-more">
                  <button onClick={() => setLimit(limit + 24)}>Show more references</button>
                </div>
              )}
            </>
          ) : (
            <Empty
              icon={<Search size={28} />}
              title="No matching references"
              text="Try a shorter phrase or choose another category."
              action={
                <button
                  onClick={() => {
                    setQuery('');
                    setCategory('All references');
                  }}
                >
                  Clear search
                </button>
              }
            />
          )}
          <details className="reference-attribution">
            <summary>Source, license & attribution</summary>
            <p>{metadata.copyright}</p>
            <p>{metadata.attribution}</p>
            <p>{metadata.transformation}</p>
            <p>
              Repository revision: <code>{metadata.revision}</code>
            </p>
            <p>
              <a href={metadata.sourceUrl} target="_blank" rel="noreferrer">
                Pinned GitHub source
              </a>{' '}
              ·{' '}
              <a href={metadata.licenseUrl} target="_blank" rel="noreferrer">
                CC BY 3.0 license
              </a>{' '}
              ·{' '}
              <a href="https://fate-srd.com/official-licensing-fate" target="_blank" rel="noreferrer">
                Official licensing guide
              </a>
            </p>
          </details>
        </section>
      </div>
      {selected && (
        <Modal wide title={selected.title} close={() => setSelected(undefined)}>
          <div className="reference-article-meta">
            <Badge>{selected.category}</Badge>
            <span>{selected.source}</span>
            {selected.readingUrl && (
              <a href={selected.readingUrl} target="_blank" rel="noreferrer">
                Read this section on Fate-SRD.com
              </a>
            )}
          </div>
          <article className="reference-article">
            {selected.body
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
          </article>
          {selected.sourceUrl && (
            <details className="reference-attribution reference-article-attribution">
              <summary>Source attribution</summary>
              <p>
                Bundled text comes from the pinned repository edition.{' '}
                <a href={selected.sourceUrl} target="_blank" rel="noreferrer">
                  View original GitHub source
                </a>
              </p>
            </details>
          )}
          <div className="modal-actions">
            <span className="muted">
              {selected.source === 'Your campaign'
                ? 'Your campaign’s reference material.'
                : `${systemName(campaign.rules)} · ©2013 Evil Hat Productions, LLC · CC BY 3.0`}
            </span>
            <button onClick={() => setSelected(undefined)}>Close reference</button>
          </div>
        </Modal>
      )}
      {creating && (
        <Modal title="Add a campaign reference" close={() => setCreating(false)}>
          <Field label="Title">
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="A custom stunt, ritual, or setting rule"
            />
          </Field>
          <Field label="Reference text">
            <textarea
              rows={8}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Describe how it works at your table."
            />
          </Field>
          <Field label="Tags" hint="Separate tags with commas.">
            <input value={tags} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={(event) => setVisibility(event.target.value as Visibility)}>
              <option value="gm">GM only</option>
              <option value="shared">Shared with players</option>
            </select>
          </Field>
          <div className="modal-actions">
            <button onClick={() => setCreating(false)}>Cancel</button>
            <button className="button-primary" disabled={saving} onClick={() => void saveReference()}>
              {saving ? 'Saving…' : 'Save reference'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

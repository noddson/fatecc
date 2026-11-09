import { useState } from 'react';
import { ArrowUpRight, BookOpen, Compass, Flag, ImagePlus, Plus, Sparkles, Users } from 'lucide-react';
import { id } from '../domain/defaults';
import { Badge, ConfirmButton, Empty, Field, Modal, PageTitle, type EditorProps } from '../ui';
import { CampaignBannerEditor } from './CampaignBanner';
import { campaignBanner } from '../campaign-banner';
export function Overview({
  campaign: c,
  update,
  dispatch,
  notify,
  readOnly,
  navigate,
}: EditorProps & { navigate: (page: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editingBanner, setEditingBanner] = useState(false);
  const banner = campaignBanner(c);
  const [form, setForm] = useState({ name: c.name, tagline: c.tagline, setting: c.setting, scale: c.scale });
  const [issue, setIssue] = useState('');
  const [baseDetails, setBaseDetails] = useState({
    name: c.name,
    tagline: c.tagline,
    setting: c.setting,
    scale: c.scale,
  });
  const pcs = c.characters.filter((ch) => ch.kind === 'pc');
  return (
    <>
      <PageTitle
        eyebrow="Your campaign"
        title={c.name}
        text={c.tagline || 'A world of possibility, one decision at a time.'}
        actions={
          !readOnly && (
            <>
              <button onClick={() => setEditingBanner(true)}>
                <ImagePlus size={16} />
                {c.bannerAssetId ? 'Change banner' : 'Add banner'}
              </button>
              <button
                onClick={() => {
                  setForm({ name: c.name, tagline: c.tagline, setting: c.setting, scale: c.scale });
                  setBaseDetails({ name: c.name, tagline: c.tagline, setting: c.setting, scale: c.scale });
                  setEditing(true);
                }}
              >
                Edit details
              </button>
            </>
          )
        }
      />
      <section className={`story-banner${banner ? ' has-banner' : ''}`}>
        {banner && (
          <img
            className="campaign-banner-image"
            src={banner.src}
            alt=""
            style={{ objectPosition: `center ${banner.position}%` }}
          />
        )}
        <div className="story-banner-copy">
          <p className="eyebrow">THE NEXT CHAPTER IS YOURS</p>
          <h2>
            Small choices.
            <br />
            Extraordinary stories.
          </h2>
          <p>{c.play.sceneName || 'Bring your characters together and see where the story takes you.'}</p>
          <button className="button-accent" onClick={() => navigate('session')}>
            Open the table <ArrowUpRight size={17} />
          </button>
        </div>
        {!banner && (
          <div className="coast-art" aria-hidden="true">
            <div className="moon" />
            <div className="hill hill-back" />
            <div className="hill hill-front" />
            <div className="lighthouse">
              <div className="beam" />
              <div className="lamp" />
              <div className="tower" />
            </div>
            <div className="wave w1" />
            <div className="wave w2" />
            <div className="star s1">✦</div>
            <div className="star s2">✧</div>
          </div>
        )}
      </section>
      <div className="quick-links">
        <button onClick={() => navigate('characters')}>
          <Users />
          <span>
            <strong>
              {pcs.length} {pcs.length === 1 ? 'character' : 'characters'}
            </strong>
            <small>Meet your protagonists</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
        <button onClick={() => navigate('journal')}>
          <BookOpen />
          <span>
            <strong>{c.world.length} world entries</strong>
            <small>Keep the story connected</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
        <button onClick={() => navigate('rules')}>
          <Compass />
          <span>
            <strong>{c.rules.name}</strong>
            <small>Rules revision {c.rules.version}</small>
          </span>
          <ArrowUpRight size={17} />
        </button>
      </div>
      <div className="two-columns">
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Compass size={18} /> A sense of place
            </h2>
          </div>
          {c.setting ? (
            <p className="prose">{c.setting}</p>
          ) : (
            <Empty
              icon={<Compass />}
              title="Give your story a home"
              text="Define a setting together: a city, a distant world, or somewhere in between."
            />
          )}
          <div className="detail-line">
            <span>Scale</span>
            <strong>{c.scale || 'Still to be discovered'}</strong>
          </div>
          <div className="detail-line">
            <span>Format</span>
            <strong>{c.kind === 'one-shot' ? 'One-shot' : 'Ongoing campaign'}</strong>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>
              <Flag size={18} /> What’s at stake
            </h2>
            <Badge>{c.issues.length} issues</Badge>
          </div>
          <p className="muted">The pressures that keep your world moving. These are game aspects.</p>
          {c.issues.map((a) => (
            <div className="issue-card" key={a.id}>
              <Sparkles size={17} />
              {readOnly ? (
                <strong>{a.name || 'An emerging issue'}</strong>
              ) : (
                <input
                  aria-label={`Game issue ${c.issues.indexOf(a) + 1}`}
                  defaultValue={a.name}
                  placeholder="Name a current or impending issue…"
                  onBlur={(e) => {
                    const name = e.target.value;
                    if (name !== a.name)
                      void update((d) => {
                        const issue = d.issues.find((x) => x.id === a.id);
                        if (issue) issue.name = name;
                      });
                  }}
                />
              )}
              {!readOnly && (
                <ConfirmButton
                  title="Remove this game issue?"
                  onConfirm={() => {
                    void update((d) => {
                      d.issues = d.issues.filter((x) => x.id !== a.id);
                    });
                  }}
                />
              )}
            </div>
          ))}
          {!readOnly && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (issue.trim()) {
                  void update((d) => {
                    d.issues.push({
                      id: id(),
                      name: issue.trim(),
                      kind: 'game',
                      freeInvokes: 0,
                      visibility: 'shared',
                    });
                  }).then((ok) => {
                    if (ok) setIssue('');
                  });
                }
              }}
            >
              <input
                aria-label="New game issue"
                placeholder="Add a current or impending issue…"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
              <button className="icon-button" aria-label="Add issue">
                <Plus size={20} />
              </button>
            </form>
          )}
        </section>
      </div>
      {editing && (
        <Modal title="Campaign details" close={() => setEditing(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void update((d) => {
                if (
                  Object.keys(baseDetails).some(
                    (key) =>
                      d[key as keyof typeof baseDetails] !== baseDetails[key as keyof typeof baseDetails],
                  )
                )
                  throw new Error(
                    'Campaign details changed in another window. Reopen the details to review them.',
                  );
                Object.assign(d, form);
              }).then((ok) => {
                if (ok) setEditing(false);
              });
            }}
          >
            <Field label="Campaign name">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Tagline">
              <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
            </Field>
            <Field label="Setting">
              <textarea
                rows={5}
                value={form.setting}
                onChange={(e) => setForm({ ...form, setting: e.target.value })}
              />
            </Field>
            <Field label="Scale">
              <input value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} />
            </Field>
            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="button-primary">Save details</button>
            </div>
          </form>
        </Modal>
      )}
      {editingBanner && (
        <CampaignBannerEditor
          key={c.id}
          campaign={c}
          update={update}
          dispatch={dispatch}
          notify={notify}
          readOnly={readOnly}
          close={() => setEditingBanner(false)}
        />
      )}
    </>
  );
}

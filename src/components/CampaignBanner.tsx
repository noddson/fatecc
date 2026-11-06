import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Asset } from '../domain/types';
import { replaceCampaignBanner } from '../domain/campaign-banner';
import { createAsset } from '../storage/assets';
import { Field, Modal, type EditorProps } from '../ui';
import './CampaignBanner.css';

export function CampaignBannerEditor({
  campaign,
  update,
  notify,
  close,
}: EditorProps & { close: () => void }) {
  const [base] = useState(() => ({ id: campaign.bannerAssetId, position: campaign.bannerPosition ?? 50 }));
  const [image, setImage] = useState<Asset | undefined>(() =>
    campaign.assets.find((asset) => asset.id === campaign.bannerAssetId),
  );
  const [position, setPosition] = useState(campaign.bannerPosition ?? 50);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  async function upload(file: File) {
    const version = ++request.current;
    setLoading(true);
    setError('');
    try {
      const asset = await createAsset(file, 'shared');
      const preview = new Image();
      preview.src = asset.dataUrl;
      try {
        await preview.decode();
      } catch {
        throw new Error('This image could not be opened. Choose a valid PNG, JPEG, or WebP image.');
      }
      if (request.current !== version) return;
      setImage(asset);
      setPosition(50);
    } catch (e) {
      if (request.current === version) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request.current === version) setLoading(false);
    }
  }
  async function save() {
    setSaving(true);
    const ok = await update((draft) => {
      if (
        draft.id !== campaign.id ||
        draft.bannerAssetId !== base.id ||
        (draft.bannerPosition ?? 50) !== base.position
      )
        throw new Error('The campaign banner changed in another window. Reopen this editor to review it.');
      replaceCampaignBanner(draft, image, position);
    });
    setSaving(false);
    if (ok) {
      notify(image ? 'Campaign banner saved.' : 'Campaign banner removed.');
      close();
    }
  }
  return (
    <Modal
      title="Campaign banner"
      close={() => {
        if (!saving) close();
      }}
      wide
    >
      <p>
        Use a landscape image for your campaign overview and library card. Uploaded banners are shared with
        players.
      </p>
      <div className="banner-preview">
        {image ? (
          <img src={image.dataUrl} alt="Banner preview" style={{ objectPosition: `center ${position}%` }} />
        ) : (
          <div className="banner-placeholder">
            <ImagePlus size={30} />
            <span>
              {base.id
                ? 'The default artwork will return when you save.'
                : 'Choose an image for your campaign'}
            </span>
          </div>
        )}
      </div>
      <Field label="Banner image" hint="PNG, JPEG, or WebP · up to 10 MB. A wide image works best.">
        <input
          aria-label="Banner image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={loading || saving}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void upload(file);
          }}
        />
      </Field>
      {image && (
        <Field
          label="Vertical position"
          hint="Move the slider to choose which part of the image stays in view."
        >
          <input
            aria-label="Vertical position"
            type="range"
            min="0"
            max="100"
            step="1"
            value={position}
            disabled={loading || saving}
            onChange={(e) => setPosition(Number(e.target.value))}
          />
        </Field>
      )}
      {loading && <p role="status">Opening image…</p>}
      {error && (
        <p role="alert" className="notice-text">
          {error}
        </p>
      )}
      <div className="modal-actions banner-actions">
        {image && (
          <button
            type="button"
            className="danger"
            disabled={loading || saving}
            onClick={() => {
              setImage(undefined);
              setPosition(50);
              setError('');
            }}
          >
            <Trash2 size={16} />
            Remove banner
          </button>
        )}
        <button type="button" onClick={close} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="button-primary"
          disabled={loading || saving || !!error || (!image && !base.id)}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save banner'}
        </button>
      </div>
    </Modal>
  );
}

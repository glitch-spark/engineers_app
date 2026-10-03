import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '../../auth/useAuth';
import * as api from '../../api/endpoints';
import { ApiError } from '../../api/client';
import { notify } from '../../lib/notify';
import Modal from '../Modal';
import CountrySelect from '../CountrySelect';
import Select from '../Select';

type FieldErrors = Partial<Record<keyof api.BidderInput, string>>;

const FIELDS: ReadonlyArray<string> = ['name', 'country', 'profileId', 'rate', 'screenshotFolderUrl'];

/** Map FastAPI's 422 `detail` list onto form fields (the last `loc` entry names the field). */
function fieldErrorsFrom(err: unknown): FieldErrors | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const detail = (err.body as { detail?: unknown } | null)?.detail;
  if (!Array.isArray(detail)) return null;
  const out: FieldErrors = {};
  for (const item of detail as Array<{ loc?: unknown[]; msg?: string }>) {
    const field = item.loc?.[item.loc.length - 1];
    if (typeof field === 'string' && FIELDS.includes(field)) {
      // Pydantic prefixes validator messages with "Value error, ".
      out[field as keyof api.BidderInput] = (item.msg || '').replace(/^Value error, /, '') || 'Invalid value';
    }
  }
  return Object.keys(out).length ? out : null;
}

export default function BidderFormModal({
  open,
  bidder,
  onClose,
  onSaved,
}: {
  open: boolean;
  bidder: api.Bidder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [profileId, setProfileId] = useState('');
  const [rate, setRate] = useState('');
  const [folderUrl, setFolderUrl] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const { data: lookup } = useSWR(open ? 'accounts-lookup' : null, () => api.lookupAccounts());

  useEffect(() => {
    if (!open) return;
    setName(bidder?.name ?? '');
    setCountry(bidder?.country ?? '');
    setProfileId(bidder?.profileId ?? '');
    setRate(bidder ? String(bidder.rate) : '');
    setFolderUrl(bidder?.screenshotFolderUrl ?? '');
    setErrors({});
  }, [open, bidder]);

  const isAdmin = user?.role === 'admin';
  const profileOptions = [
    { value: '', label: 'No profile' },
    ...(lookup?.accounts ?? [])
      .filter((a) => !a.archived && (a.createdBy === user?.id || isAdmin))
      .map((a) => ({ value: a._id, label: a.name })),
  ];
  // Keep the bidder's current profile selectable even when the filter (or a pending lookup) hides it.
  if (bidder?.profileId && !profileOptions.some((o) => o.value === bidder.profileId)) {
    profileOptions.splice(1, 0, { value: bidder.profileId, label: bidder.profileName ?? 'Current profile' });
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const body: api.BidderInput = {
      name: name.trim(),
      country: country || null,
      profileId: profileId || null,
      rate: Number(rate),
      screenshotFolderUrl: folderUrl.trim(),
    };
    try {
      if (bidder) await api.updateBidder(bidder._id, body);
      else await api.createBidder(body);
      notify.success('Bidder saved');
      onSaved();
    } catch (err) {
      const fieldErrors = fieldErrorsFrom(err);
      if (fieldErrors) setErrors(fieldErrors);
      else notify.error(err, 'Failed to save bidder');
    } finally {
      setSaving(false);
    }
  };

  const errorText = (msg?: string) => (msg ? <p className="text-xs text-red-600 mt-1" role="alert">{msg}</p> : null);

  return (
    <Modal open={open} onClose={onClose} title={bidder ? 'Edit bidder' : 'Add bidder'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="bidder-name">Name</label>
          <input
            id="bidder-name"
            className="input w-full text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {errorText(errors.name)}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="bidder-country">
            Country <span className="text-faint font-normal">(optional)</span>
          </label>
          <CountrySelect id="bidder-country" value={country} onChange={setCountry} />
          {errorText(errors.country)}
        </div>
        <div>
          <Select
            id="bidder-profile"
            label="Profile"
            labelClassName="block text-xs font-medium text-muted mb-1"
            value={profileId}
            onChange={setProfileId}
            options={profileOptions}
          />
          {errorText(errors.profileId)}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="bidder-rate">Rate per bid</label>
          <div className="relative">
            <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span>
            <input
              id="bidder-rate"
              type="number"
              step="0.01"
              min={0}
              className="input w-full text-sm !pl-7"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </div>
          {errorText(errors.rate)}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="bidder-folder">
            Screenshot folder URL
          </label>
          <input
            id="bidder-folder"
            className="input w-full text-sm"
            placeholder="s3://bid-screenshots/puma/"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            required
          />
          {errorText(errors.screenshotFolderUrl)}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import * as api from '../../api/endpoints';
import type { Caller, CallerColor } from '../../api/endpoints';
import Modal from '../Modal';
import { notify } from '../../lib/notify';
import { useCallers } from '../../lib/useCallers';
import { CALLER_COLORS, CALLER_DOT } from '../../lib/callerColors';

function ColorPicker({ value, onChange, label }: { value: CallerColor; onChange: (c: CallerColor) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {CALLER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          title={c}
          onClick={() => onChange(c)}
          className={`flex h-5 w-5 items-center justify-center rounded-full ${CALLER_DOT[c]} ${value === c ? 'ring-2 ring-offset-1 ring-zinc-700 dark:ring-zinc-200 dark:ring-offset-zinc-900' : 'opacity-70 hover:opacity-100'}`}
        >
          {value === c && <Check size={11} className="text-white" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

function CallerRow({ caller, onChanged }: { caller: Caller; onChanged: () => void }) {
  const [name, setName] = useState(caller.name);
  const [color, setColor] = useState<CallerColor>(caller.color);
  const [busy, setBusy] = useState<'' | 'save' | 'delete'>('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setName(caller.name); setColor(caller.color); }, [caller.name, caller.color]);
  const dirty = name.trim() !== caller.name || color !== caller.color;

  const save = async () => {
    setBusy('save');
    try {
      await api.updateCaller(caller._id, { name: name.trim(), color });
      notify.success('Caller saved');
      onChanged();
    } catch (err) {
      notify.error(err, 'Failed to save the caller');
    } finally {
      setBusy('');
    }
  };
  const remove = async () => {
    setBusy('delete');
    try {
      await api.deleteCaller(caller._id);
      notify.success(`${caller.name} removed`);
      onChanged();
    } catch (err) {
      notify.error(err, 'Failed to delete the caller');
      setBusy('');
    }
  };

  return (
    <li className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <input className="input flex-1 py-1.5 text-sm" value={name} maxLength={60} aria-label="Caller name"
          onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn btn-sm" onClick={save} disabled={!dirty || !name.trim() || !!busy}>
          {busy === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Save
        </button>
        {confirming ? (
          <span className="flex items-center gap-1 text-xs">
            Delete?
            <button type="button" className="btn-danger btn-sm" onClick={remove} disabled={!!busy}>
              {busy === 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : 'Yes'}
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setConfirming(false)} disabled={!!busy}>No</button>
          </span>
        ) : (
          <button type="button" className="btn-icon" aria-label={`Delete ${caller.name}`} onClick={() => setConfirming(true)}>
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>
      <ColorPicker value={color} onChange={setColor} label={`${caller.name} colour`} />
    </li>
  );
}

/** Admin / interview managers: add, rename, recolour and delete callers. Assigned rounds keep a deleted caller's name. */
export default function CallersManager({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { callers, mutate } = useCallers();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const changed = () => { void mutate(); onChanged(); };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.createCaller({ name: name.trim() });
      notify.success('Caller added');
      setName('');
      changed();
    } catch (err) {
      notify.error(err, 'Failed to add the caller');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Manage callers">
      <div className="space-y-4">
        <form onSubmit={add} className="flex items-center gap-2">
          <input className="input flex-1 text-sm" placeholder="New caller name" value={name} maxLength={60}
            aria-label="New caller name" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn" disabled={adding || !name.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />} Add
          </button>
        </form>
        {callers.length === 0 ? (
          <p className="text-sm text-muted">No callers yet. Add the first one above.</p>
        ) : (
          <ul className="max-h-[55vh] space-y-2 overflow-y-auto">
            {callers.map((c) => <CallerRow key={c._id} caller={c} onChanged={changed} />)}
          </ul>
        )}
        <p className="text-xs text-muted">
          Renaming updates the rounds already assigned. Deleting keeps the name on those rounds.
        </p>
      </div>
    </Modal>
  );
}

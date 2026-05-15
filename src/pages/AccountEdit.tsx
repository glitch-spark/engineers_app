import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, Save, X } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

type ContactItem = { label: string; display: string; url: string; show: boolean };

type AccShape = {
  _id?: string;
  name?: string;
  title?: string;
  titleAutoFromJD?: boolean;
  education?: string;
  experience?: string;
  projects?: string;
  contactItems?: ContactItem[];
};

const DEFAULT_CONTACT_ITEMS: ContactItem[] = [
  { label: 'Email', display: '', url: '', show: true },
  { label: 'Phone', display: '', url: '', show: true },
  { label: 'Address', display: '', url: '', show: true },
  { label: 'GitHub', display: '', url: '', show: false },
  { label: 'LinkedIn', display: '', url: '', show: false },
  { label: 'Website', display: '', url: '', show: false },
  { label: 'Twitter / X', display: '', url: '', show: false },
];

const EMPTY_FORM = {
  name: '',
  title: '',
  titleAutoFromJD: false,
  education: '',
  experience: '',
  projects: '',
  contactItems: DEFAULT_CONTACT_ITEMS as ContactItem[],
};

type FormState = typeof EMPTY_FORM;

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_FORM);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(id!)) as AccShape;
        if (cancelled) return;
        setForm({
          name: acc.name || '',
          title: acc.title || '',
          titleAutoFromJD: !!acc.titleAutoFromJD,
          education: acc.education || '',
          experience: acc.experience || '',
          projects: acc.projects || '',
          contactItems: (acc.contactItems && acc.contactItems.length
            ? acc.contactItems
            : DEFAULT_CONTACT_ITEMS) as ContactItem[],
        });
      } catch (err) {
        notify.error(err, 'Could not load profile');
        navigate('/accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, navigate]);

  async function save() {
    if (!form.name.trim()) {
      notify.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (isNew) {
        const created = (await api.createAccount(payload)) as AccShape;
        notify.success(`Profile "${form.name}" created`);
        const newId = created._id || (created as Record<string, unknown>)['_id'];
        if (typeof newId === 'string') {
          navigate(`/accounts/${newId}`, { replace: true });
        } else {
          navigate('/accounts');
        }
      } else {
        await api.updateAccount(id!, payload);
        notify.success(`Profile "${form.name}" updated`);
      }
    } catch (err) {
      notify.error(err, 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/accounts" className="text-gray-500 hover:text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            {isNew ? 'New profile' : `Edit ${form.name || 'profile'}`}
          </h1>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isNew ? 'Create' : 'Save changes'}
        </button>
      </header>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Basic info</h2>
        <Field label="Name *">
          <input
            className="input w-full text-sm"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Title" hint="Rendered under the candidate's name on the resume header.">
          <input
            className="input w-full text-sm"
            placeholder="e.g. Senior Software Engineer"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            disabled={form.titleAutoFromJD}
          />
        </Field>
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.titleAutoFromJD}
            onChange={(e) => setForm({ ...form, titleAutoFromJD: e.target.checked })}
          />
          <span>
            Auto-generate from job description. The static title above is used only as a seniority hint when this is on.
          </span>
        </label>
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Contact items</h2>
          <p className="text-xs text-gray-500">
            Each row has display text, an optional URL, and a checkbox to control whether it shows on the resume. Drag arrows to reorder. The order is the contact-line order in the rendered resume.
          </p>
        </div>
        <ContactItemsEditor
          items={form.contactItems}
          onChange={(items) => setForm({ ...form, contactItems: items })}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Resume content</h2>
        <p className="text-xs text-gray-500">The structured fields the LLM prompt uses.</p>
        <Field label="Education">
          <textarea
            className="input w-full text-sm"
            rows={2}
            value={form.education}
            onChange={(e) => setForm({ ...form, education: e.target.value })}
            placeholder="University name, degree, years"
          />
        </Field>
        <Field label="Experience" hint="Required to generate a resume.">
          <textarea
            className="input w-full text-sm"
            rows={5}
            value={form.experience}
            onChange={(e) => setForm({ ...form, experience: e.target.value })}
            placeholder={'Company | Role | Period (one per line)'}
          />
        </Field>
        <Field
          label="Projects"
          hint={'Group projects under each company. Format: numbered company name on its own line, then "- Project Name: short description" lines under it. The LLM uses the company headings to attribute projects directly.'}
        >
          <textarea
            className="input w-full text-sm font-mono"
            rows={10}
            value={form.projects}
            onChange={(e) => setForm({ ...form, projects: e.target.value })}
            placeholder={'1. Apple\n- Apple Developer Program App: developed apple developer program oauth guard.\n\n2. Google\n- Google Drive Api: dev\'d google drive api key management platform.'}
          />
        </Field>
      </section>
    </div>
  );
}

function ContactItemsEditor({
  items,
  onChange,
}: {
  items: ContactItem[];
  onChange: (next: ContactItem[]) => void;
}) {
  function update(i: number, patch: Partial<ContactItem>) {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function move(i: number, dir: -1 | 1) {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[i], next[target]] = [next[target], next[i]];
    onChange(next);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { label: '', display: '', url: '', show: true }]);
  }

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-gray-400 px-1">
        <span className="col-span-1 text-center">Show</span>
        <span className="col-span-2">Label</span>
        <span className="col-span-4">Display</span>
        <span className="col-span-3">URL</span>
        <span className="col-span-2"></span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-1 flex justify-center">
            <input
              type="checkbox"
              checked={item.show}
              onChange={(e) => update(i, { show: e.target.checked })}
            />
          </div>
          <input
            className="col-span-2 input text-sm"
            placeholder="Email"
            value={item.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <input
            className="col-span-4 input text-sm"
            placeholder="e.g. me@example.com"
            value={item.display}
            onChange={(e) => update(i, { display: e.target.value })}
          />
          <input
            type="url"
            className="col-span-3 input text-sm"
            placeholder="e.g. mailto:me@example.com"
            value={item.url}
            onChange={(e) => update(i, { url: e.target.value })}
          />
          <div className="col-span-2 flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              className="p-1 text-gray-400 hover:text-red-600"
              title="Remove"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus size={12} /> Add contact item
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

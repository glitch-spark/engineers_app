import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';

type AccShape = {
  _id?: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  label?: string;
  education?: string;
  experience?: string;
  github?: string;
  linkedin?: string;
  website?: string;
  twitter?: string;
  contactLabels?: Record<string, string>;
};

const CONTACT_TYPES = ['email', 'phone', 'address', 'github', 'linkedin', 'website', 'twitter'] as const;
type ContactType = typeof CONTACT_TYPES[number];

const EMPTY_FORM = {
  name: '',
  email: '',
  phone: '',
  address: '',
  label: '',
  education: '',
  experience: '',
  github: '',
  linkedin: '',
  website: '',
  twitter: '',
  contactLabels: {} as Record<string, string>,
};

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [form, setForm] = useState(EMPTY_FORM);
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
          email: acc.email || '',
          phone: acc.phone || '',
          address: acc.address || '',
          label: acc.label || '',
          education: acc.education || '',
          experience: acc.experience || '',
          github: acc.github || '',
          linkedin: acc.linkedin || '',
          website: acc.website || '',
          twitter: acc.twitter || '',
          contactLabels: acc.contactLabels || {},
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
    if (!form.email.trim()) {
      notify.error('Email is required (Contact items → Email)');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = (await api.createAccount(form)) as AccShape;
        notify.success(`Profile "${form.name}" created`);
        const newId = created._id || (created as Record<string, unknown>)['_id'];
        if (typeof newId === 'string') {
          navigate(`/accounts/${newId}`, { replace: true });
        } else {
          navigate('/accounts');
        }
      } else {
        await api.updateAccount(id!, form);
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
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Contact items</h2>
        <p className="text-xs text-gray-500">
          Display name + URL pairs shown in the resume contact line. Toggle visibility/order in
          Resume styling. Empty rows are hidden.
        </p>
        <ContactPair
          type="email"
          label="Email"
          placeholder={{ display: 'me@example.com', url: 'mailto:me@example.com (optional)' }}
          form={form}
          setForm={setForm}
        />
        <ContactPair
          type="phone"
          label="Phone"
          placeholder={{ display: '(555) 123-4567', url: 'tel:+15551234567 (optional)' }}
          form={form}
          setForm={setForm}
        />
        <ContactPair
          type="address"
          label="Address"
          placeholder={{ display: 'San Francisco, CA', url: '(no link)' }}
          form={form}
          setForm={setForm}
          urlOptional
        />
        <ContactPair
          type="github"
          label="GitHub"
          placeholder={{ display: 'github.com/foo', url: 'https://github.com/foo' }}
          form={form}
          setForm={setForm}
        />
        <ContactPair
          type="linkedin"
          label="LinkedIn"
          placeholder={{ display: 'linkedin.com/in/foo', url: 'https://linkedin.com/in/foo' }}
          form={form}
          setForm={setForm}
        />
        <ContactPair
          type="website"
          label="Website"
          placeholder={{ display: 'foo.dev', url: 'https://foo.dev' }}
          form={form}
          setForm={setForm}
        />
        <ContactPair
          type="twitter"
          label="Twitter / X"
          placeholder={{ display: '@foo', url: 'https://x.com/foo' }}
          form={form}
          setForm={setForm}
        />
      </section>

      <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Resume content</h2>
        <p className="text-xs text-gray-500">The structured fields the LLM prompt uses.</p>
        <Field label="Variant label">
          <input
            className="input w-full text-sm"
            placeholder="e.g. AI focus, Backend variant"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </Field>
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
      </section>

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

type FormState = typeof EMPTY_FORM;

function ContactPair({
  type,
  label,
  placeholder,
  form,
  setForm,
  urlOptional = false,
}: {
  type: ContactType;
  label: string;
  placeholder: { display: string; url: string };
  form: FormState;
  setForm: (f: FormState) => void;
  urlOptional?: boolean;
}) {
  // Address has no URL slot of its own; everything else has a top-level URL field.
  const urlValue =
    type === 'email' ? form.email
    : type === 'phone' ? form.phone
    : type === 'address' ? form.address
    : type === 'github' ? form.github
    : type === 'linkedin' ? form.linkedin
    : type === 'website' ? form.website
    : form.twitter;

  const setUrl = (v: string) => {
    const next: FormState = { ...form };
    if (type === 'email') next.email = v;
    else if (type === 'phone') next.phone = v;
    else if (type === 'address') next.address = v;
    else if (type === 'github') next.github = v;
    else if (type === 'linkedin') next.linkedin = v;
    else if (type === 'website') next.website = v;
    else next.twitter = v;
    setForm(next);
  };

  const labelValue = form.contactLabels?.[type] || '';
  const setLabel = (v: string) => {
    const nextLabels = { ...(form.contactLabels || {}) };
    if (v) nextLabels[type] = v; else delete nextLabels[type];
    setForm({ ...form, contactLabels: nextLabels });
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <span className="col-span-2 text-xs font-medium text-gray-600">{label}</span>
      <input
        className="col-span-4 input text-sm"
        placeholder={`Display: ${placeholder.display}`}
        value={labelValue}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        type={type === 'address' ? 'text' : 'url'}
        className="col-span-6 input text-sm"
        placeholder={`URL: ${placeholder.url}`}
        value={urlValue}
        onChange={(e) => setUrl(e.target.value)}
        disabled={urlOptional && type === 'address'}
      />
    </div>
  );
}

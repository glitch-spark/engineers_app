import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, GripVertical, Loader2, Plus, Save, X } from 'lucide-react';
import * as api from '../api/endpoints';
import { notify } from '../lib/notify';
import ResumePromptField from '../components/ResumePromptField';
import ResumeStylingEditor from '../components/ResumeStylingEditor';

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
  resumePromptBody?: string;
  screeningPrompt?: string;
  screeningPromptMode?: 'markdown' | 'plaintext';
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

const EMPTY_INFO = {
  name: '',
  title: '',
  titleAutoFromJD: false,
  education: '',
  experience: '',
  projects: '',
  contactItems: DEFAULT_CONTACT_ITEMS as ContactItem[],
};

type InfoForm = typeof EMPTY_INFO;
type Tab = 'info' | 'template' | 'prompt';

export default function AccountEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) || 'info';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  const [form, setForm] = useState<InfoForm>(EMPTY_INFO);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      setForm(EMPTY_INFO);
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

  async function saveInfo() {
    if (!form.name.trim()) {
      notify.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = (await api.createAccount({ ...form })) as AccShape;
        notify.success(`Profile "${form.name}" created`);
        const newId = created._id || (created as Record<string, unknown>)['_id'];
        if (typeof newId === 'string') {
          navigate(`/accounts/${newId}?tab=info`, { replace: true });
        } else {
          navigate('/accounts');
        }
      } else {
        await api.updateAccount(id!, { ...form });
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
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/accounts" className="text-gray-500 hover:text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">
          {isNew ? 'New profile' : `Edit ${form.name || 'profile'}`}
        </h1>
      </header>

      <div className="flex items-center gap-1 border-b border-gray-200">
        <TabBtn active={tab === 'info'} onClick={() => setTab('info')}>Details</TabBtn>
        <TabBtn active={tab === 'template'} onClick={() => setTab('template')}>Template</TabBtn>
        <TabBtn active={tab === 'prompt'} onClick={() => setTab('prompt')}>Prompts</TabBtn>
      </div>

      {tab === 'info' && (
        <div className="space-y-5">
          <Section
            title="Identity"
            desc="Who the candidate is — shown at the top of the resume header."
          >
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
          </Section>

          <Section
            title="Contact line"
            desc="The contact row in the resume header. Toggle Show, set the visible text and link, drag to reorder."
          >
            <ContactItemsEditor
              items={form.contactItems}
              onChange={(items) => setForm({ ...form, contactItems: items })}
            />
          </Section>

          <Section
            title="Career history"
            desc="Source material the LLM tailors into the resume. Follow each field's format."
          >
            <Field label="Education">
              <FormatHint format="School | Degree | Period — one per line" />
              <textarea
                className="input w-full text-sm"
                rows={3}
                value={form.education}
                onChange={(e) => setForm({ ...form, education: e.target.value })}
                placeholder={'MIT | B.S. Computer Science | 2014 - 2018'}
              />
            </Field>
            <Field label="Experience">
              <FormatHint format="Company | Role | Period — one per line" />
              <textarea
                className="input w-full text-sm"
                rows={5}
                value={form.experience}
                onChange={(e) => setForm({ ...form, experience: e.target.value })}
                placeholder={'Acme Corp | Senior Engineer | 2022/03 - Present\nFoo Labs | Software Engineer | 2019/06 - 2022/02'}
              />
            </Field>
            <Field label="Projects">
              <FormatHint format={'"N. Company" heading, then "- Project: description" lines under it'} />
              <textarea
                className="input w-full text-sm"
                rows={10}
                value={form.projects}
                onChange={(e) => setForm({ ...form, projects: e.target.value })}
                placeholder={'1. Acme Corp\n- Checkout Redesign: rebuilt the cart flow with optimistic UI.\n\n2. Foo Labs\n- Feature-Flag Dashboard: internal tool for safe rollouts.'}
              />
            </Field>
          </Section>

          <div className="flex justify-end">
            <button
              onClick={saveInfo}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isNew ? 'Create Profile' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {tab === 'template' && (
        isNew ? (
          <NeedsProfile />
        ) : (
          <ResumeStylingEditor accountId={id!} showHeader={false} />
        )
      )}

      {tab === 'prompt' && (
        isNew ? <NeedsProfile /> : <PromptTab accountId={id!} />
      )}
    </div>
  );
}

function TabBtn({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ' +
        (active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-gray-600 hover:text-gray-900')
      }
    >
      {children}
    </button>
  );
}

function NeedsProfile() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center text-sm text-gray-500">
      Save the profile on the Info tab first — this tab needs an existing profile.
    </div>
  );
}

function PromptTab({ accountId }: { accountId: string }) {
  const [resumePrompt, setResumePrompt] = useState('');
  const [screeningPrompt, setScreeningPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const acc = (await api.getAccount(accountId)) as AccShape;
        if (cancelled) return;
        setResumePrompt(acc.resumePromptBody || '');
        setScreeningPrompt(acc.screeningPrompt || '');
      } catch (err) {
        notify.error(err, 'Could not load prompts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  async function save() {
    setSaving(true);
    try {
      await api.updateAccount(accountId, {
        resumePromptBody: resumePrompt,
        screeningPrompt: screeningPrompt,
      });
      notify.success('Prompts saved');
    } catch (err) {
      notify.error(err, 'Failed to save prompts');
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
    <div className="space-y-5">
      <Section
        title="Resume generating prompt"
        desc="Drives how resume CONTENT is written — bullets, projects, skills, summary. Overrides your global prompt (Prompts page) for this profile only. Empty = inherit global → built-in default."
      >
        <ResumePromptField
          value={resumePrompt}
          onChange={setResumePrompt}
          label="Profile resume content prompt"
          hint="Empty = inherit global → built-in default."
        />
      </Section>

      <Section
        title="Screening Q&A answering prompt"
        desc="How screening-question answers are written for this profile. Overrides your global screening prompt (Prompts page). Empty = inherit global → built-in default."
      >
        <ResumePromptField
          kind="screening"
          value={screeningPrompt}
          onChange={setScreeningPrompt}
          label="Profile screening prompt"
          hint="Empty = inherit global → built-in default."
        />
      </Section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white font-medium shadow-sm hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save prompts
        </button>
      </div>
    </div>
  );
}

// Placeholder hints keyed by the row's label (lowercased prefix match).
function placeholdersFor(label: string): { display: string; url: string } {
  const l = label.toLowerCase();
  if (l.startsWith('email')) return { display: 'jane@example.com', url: 'mailto:jane@example.com' };
  if (l.startsWith('phone')) return { display: '(555) 123-4567', url: 'tel:+15551234567' };
  if (l.startsWith('address')) return { display: 'San Francisco, CA', url: '(no link)' };
  if (l.startsWith('github')) return { display: 'github.com/jane', url: 'https://github.com/jane' };
  if (l.startsWith('linkedin')) return { display: 'linkedin.com/in/jane', url: 'https://linkedin.com/in/jane' };
  if (l.startsWith('website')) return { display: 'jane.dev', url: 'https://jane.dev' };
  if (l.startsWith('twitter')) return { display: '@jane', url: 'https://x.com/jane' };
  return { display: 'Portfolio', url: 'https://…' };
}

function ContactItemsEditor({
  items,
  onChange,
}: {
  items: ContactItem[];
  onChange: (next: ContactItem[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  function update(i: number, patch: Partial<ContactItem>) {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, { label: '', display: '', url: '', show: true }]);
  }

  const previewLine = items
    .filter((it) => it.show && it.display.trim())
    .map((it) => it.display.trim())
    .join('  ·  ');

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-400">
        <strong>Display</strong> = text shown on the resume. <strong>URL</strong> = link target (optional;
        leave blank for plain text like an address).
      </p>

      <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-gray-400 px-1">
        <span className="col-span-1"></span>
        <span className="col-span-1 text-center">Show</span>
        <span className="col-span-2">Label</span>
        <span className="col-span-4">Display</span>
        <span className="col-span-3">URL</span>
        <span className="col-span-1"></span>
      </div>

      {items.map((item, i) => {
        const ph = placeholdersFor(item.label);
        return (
          <div
            key={i}
            draggable
            onDragStart={(e) => {
              setDragIdx(i);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(i));
            }}
            onDragEnter={() => setOverIdx(i)}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => {
              e.preventDefault();
              move(Number(e.dataTransfer.getData('text/plain')), i);
              setDragIdx(null); setOverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            className={
              'grid grid-cols-12 gap-2 items-center rounded-md py-1 ' +
              (dragIdx === i ? 'opacity-40 ' : '') +
              (overIdx === i && dragIdx !== i ? 'bg-blue-50/60 ' : '') +
              (!item.show ? 'opacity-55' : '')
            }
          >
            <div className="col-span-1 flex justify-center text-gray-300 cursor-grab" title="Drag to reorder">
              <GripVertical size={14} />
            </div>
            <div className="col-span-1 flex justify-center">
              <input
                type="checkbox"
                checked={item.show}
                onChange={(e) => update(i, { show: e.target.checked })}
                title="Show on resume"
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
              placeholder={ph.display}
              value={item.display}
              onChange={(e) => update(i, { display: e.target.value })}
            />
            <input
              type="text"
              className="col-span-3 input text-sm"
              placeholder={ph.url}
              value={item.url}
              onChange={(e) => update(i, { url: e.target.value })}
            />
            <div className="col-span-1 flex items-center justify-end">
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
        );
      })}

      <button
        type="button"
        onClick={add}
        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus size={12} /> Add contact item
      </button>

      <div className="mt-2 border-t border-gray-100 pt-2">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Contact line preview</div>
        {previewLine ? (
          <div className="text-sm text-gray-700">{previewLine}</div>
        ) : (
          <div className="text-xs text-gray-400 italic">Enable rows and fill Display to see the contact line.</div>
        )}
      </div>
    </div>
  );
}

function Section({
  title, desc, children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      {children}
    </section>
  );
}

function FormatHint({ format }: { format: string }) {
  return (
    <p className="text-[11px] text-gray-400 mb-1">
      <span className="font-medium text-gray-500">Format:</span> {format}
    </p>
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

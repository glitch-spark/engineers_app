import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import TypographyRow, { type TypographyRowValue } from './TypographyRow';
import type { ContactItem, ContactItemType, SectionKey, StyleConfig, Typography } from '../lib/resumeStyles';
import { TEMPLATES, type TemplateKey } from '../lib/resumeStyleTemplates';
import { contactDisplay, contactUrl, type AccountForPreview } from '../lib/resumePreview';

const CONTACT_TYPE_LABELS: Record<ContactItemType, string> = {
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  website: 'Website',
  twitter: 'Twitter / X',
  custom: 'Custom',
};

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Summary',
  experience: 'Professional Experience',
  skills: 'Skills',
  education: 'Education',
};

export default function StructuredStyleForm({
  value,
  onChange,
  account,
}: {
  value: StyleConfig;
  onChange: (v: StyleConfig) => void;
  account?: AccountForPreview;
}) {
  const set = <K extends keyof StyleConfig>(k: K, v: StyleConfig[K]) => onChange({ ...value, [k]: v });

  function setBasicInfo<K extends keyof StyleConfig['basicInfo']>(k: K, v: StyleConfig['basicInfo'][K]) {
    onChange({ ...value, basicInfo: { ...value.basicInfo, [k]: v } });
  }

  function setExperience<K extends keyof StyleConfig['experience']>(k: K, v: StyleConfig['experience'][K]) {
    onChange({ ...value, experience: { ...value.experience, [k]: v } });
  }

  function setEducation<K extends keyof StyleConfig['education']>(k: K, v: StyleConfig['education'][K]) {
    onChange({ ...value, education: { ...value.education, [k]: v } });
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const next = [...value.sectionOrder];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    set('sectionOrder', next);
  }

  return (
    <div className="space-y-6 text-sm">
      <Group title="Template">
        <div className="flex gap-2">
          {(Object.keys(TEMPLATES) as TemplateKey[]).map((key) => (
            <button
              key={key}
              onClick={() => onChange(TEMPLATES[key].config)}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 hover:bg-gray-50"
            >
              {TEMPLATES[key].label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Apply a starter template, then tweak. Overwrites all current settings.
        </p>
      </Group>

      <Group title="Page margins (pt)">
        <div className="grid grid-cols-4 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side} className="text-xs text-gray-500">
              <span className="block mb-1 capitalize">{side}</span>
              <input
                type="number"
                min={0}
                max={120}
                value={value.page.margin[side]}
                onChange={(e) =>
                  set('page', { ...value.page, margin: { ...value.page.margin, [side]: Number(e.target.value) } })
                }
                className="border border-gray-200 rounded-md px-2 py-1 w-full"
              />
            </label>
          ))}
        </div>
      </Group>

      <Group title="Section order">
        <ul className="border border-gray-200 rounded-md divide-y divide-gray-100">
          {value.sectionOrder.map((key, idx) => (
            <li key={key} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-gray-700">{SECTION_LABELS[key]}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => moveSection(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveSection(idx, 1)}
                  disabled={idx === value.sectionOrder.length - 1}
                  className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Basic info">
        <div className="space-y-2">
          <TypographyRow
            label="Name"
            value={value.basicInfo.name}
            onChange={(v) => setBasicInfo('name', { ...value.basicInfo.name, ...v })}
          />
          <TypographyRow
            label="Title"
            value={value.basicInfo.title}
            onChange={(v) => setBasicInfo('title', { ...value.basicInfo.title, ...v })}
          />
          <input
            value={value.basicInfo.title.text}
            onChange={(e) => setBasicInfo('title', { ...value.basicInfo.title, text: e.target.value })}
            placeholder="Title text (e.g. Senior Software Engineer)"
            className="input w-full text-sm"
          />
          <TypographyRow
            label="Contact"
            value={value.basicInfo.contact}
            onChange={(v) => setBasicInfo('contact', { ...value.basicInfo.contact, ...v })}
          />
          <ContactItemsEditor
            items={value.basicInfo.contact.items}
            account={account}
            onChange={(items) =>
              setBasicInfo('contact', { ...value.basicInfo.contact, items })
            }
          />
        </div>
      </Group>

      <Group title="Section heading">
        <TypographyRow
          label="Heading"
          value={value.sectionHeading}
          onChange={(v) => set('sectionHeading', { ...value.sectionHeading, ...v })}
        />
      </Group>

      <Group title="Summary">
        <TypographyRow
          label="Body"
          value={value.summary}
          onChange={(v) => set('summary', { ...value.summary, ...v })}
        />
        <BoldToggle
          label="Bold category labels"
          value={value.summary.boldLabels}
          onChange={(b) => set('summary', { ...value.summary, boldLabels: b })}
        />
      </Group>

      <Group title="Experience">
        <div className="space-y-2">
          <TypographyRow
            label="Company name"
            showAlign={false}
            value={value.experience.companyName as TypographyRowValue}
            onChange={(v) => setExperience('companyName', stripAlign(v))}
          />
          <TypographyRow
            label="Role"
            showAlign={false}
            value={value.experience.role as TypographyRowValue}
            onChange={(v) => setExperience('role', stripAlign(v))}
          />
          <TypographyRow
            label="Period"
            showAlign={false}
            value={value.experience.period as TypographyRowValue}
            onChange={(v) =>
              setExperience('period', { ...stripAlign(v), format: value.experience.period.format })
            }
          />
          <TypographyRow
            label="Bullet"
            value={value.experience.bullet}
            onChange={(v) => setExperience('bullet', { ...value.experience.bullet, ...v })}
          />
          <div className="grid grid-cols-12 gap-2 items-center text-xs text-gray-500 pl-1">
            <span className="col-span-3">Bullet indent (px)</span>
            <input
              type="number"
              min={0}
              max={40}
              value={value.experience.bullet.indentPx}
              onChange={(e) =>
                setExperience('bullet', { ...value.experience.bullet, indentPx: Number(e.target.value) })
              }
              className="col-span-2 border border-gray-200 rounded-md px-2 py-1 text-sm"
            />
          </div>
          <BoldToggle
            label="Bold keywords in bullets"
            value={value.experience.bullet.boldKeywords}
            onChange={(b) => setExperience('bullet', { ...value.experience.bullet, boldKeywords: b })}
          />
        </div>
      </Group>

      <Group title="Skills">
        <TypographyRow
          label="Body"
          value={value.skills}
          onChange={(v) => set('skills', { ...value.skills, ...v })}
        />
        <BoldToggle
          label="Bold category names"
          value={value.skills.boldCategories}
          onChange={(b) => set('skills', { ...value.skills, boldCategories: b })}
        />
        <label className="text-xs text-gray-500 flex items-center gap-2 mt-1">
          Layout
          <select
            value={value.skills.layout}
            onChange={(e) => set('skills', { ...value.skills, layout: e.target.value as 'one-per-line' | 'comma' })}
            className="border border-gray-200 rounded-md px-2 py-1 text-sm"
          >
            <option value="one-per-line">One per line</option>
            <option value="comma">Comma separated</option>
          </select>
        </label>
      </Group>

      <Group title="Education">
        <div className="space-y-2">
          <TypographyRow
            label="University"
            showAlign={false}
            value={value.education.university as TypographyRowValue}
            onChange={(v) => setEducation('university', stripAlign(v))}
          />
          <TypographyRow
            label="Degree"
            showAlign={false}
            value={value.education.degree as TypographyRowValue}
            onChange={(v) => setEducation('degree', stripAlign(v))}
          />
          <TypographyRow
            label="Period"
            showAlign={false}
            value={value.education.period as TypographyRowValue}
            onChange={(v) =>
              setEducation('period', { ...stripAlign(v), format: value.education.period.format })
            }
          />
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-gray-200 rounded-lg p-3">
      <legend className="text-xs font-semibold text-gray-500 px-1 uppercase tracking-wider">{title}</legend>
      <div className="mt-2 space-y-2">{children}</div>
    </fieldset>
  );
}

function BoldToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-500 mt-1">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Strip the `align` extra from a TypographyRowValue when writing back to a
 *  field that stores plain Typography (no alignment). */
function stripAlign(v: TypographyRowValue): Typography {
  const { fontFamily, fontSize, fontWeight, color } = v;
  return { fontFamily, fontSize, fontWeight, color };
}

function ContactItemsEditor({
  items,
  onChange,
  account,
}: {
  items: ContactItem[];
  onChange: (items: ContactItem[]) => void;
  account?: AccountForPreview;
}) {
  const update = (i: number, patch: Partial<ContactItem>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[i], next[target]] = [next[target], next[i]];
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const addCustom = () => {
    onChange([...items, { type: 'custom', enabled: true, customLabel: '', customUrl: '' }]);
  };

  // Hide built-in contact rows that have no underlying value on the profile —
  // user can add a value in Profile edit and it'll appear here automatically.
  // Custom rows always show (they're authored here).
  const visible = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (item.type === 'custom') return true;
      if (!account) return true;
      return Boolean(contactDisplay(item.type, account));
    });

  const hiddenCount = items.length - visible.length;

  return (
    <div className="border border-gray-200 rounded-md p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Contact items</span>
        <button
          type="button"
          onClick={addCustom}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus size={12} /> Add custom link
        </button>
      </div>
      <p className="text-[11px] text-gray-400">
        Toggle which items appear in the contact line; reorder with arrows. Values come from the
        Profile's Contact items. Empty types are hidden — fill them on the Profile to make them
        appear.
      </p>
      <ul className="divide-y divide-gray-100">
        {visible.map(({ item, idx: i }) => {
          const display = item.type === 'custom'
            ? (item.customLabel || item.customUrl || '')
            : (account ? contactDisplay(item.type, account) : '');
          const url = item.type === 'custom'
            ? (item.customUrl || '')
            : (account ? contactUrl(item.type, account) : '');
          return (
          <li key={`${item.type}-${i}`} className="flex items-center gap-1 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={(e) => update(i, { enabled: e.target.checked })}
              title="Show in contact line"
            />
            <span className="w-20 text-gray-700">{CONTACT_TYPE_LABELS[item.type]}</span>
            {item.type === 'custom' ? (
              <>
                <input
                  type="text"
                  value={item.customLabel ?? ''}
                  onChange={(e) => update(i, { customLabel: e.target.value })}
                  placeholder="Label (e.g. Portfolio)"
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs"
                />
                <input
                  type="url"
                  value={item.customUrl ?? ''}
                  onChange={(e) => update(i, { customUrl: e.target.value })}
                  placeholder="https://..."
                  className="flex-1 min-w-0 border border-gray-200 rounded px-2 py-1 text-xs"
                />
              </>
            ) : (
              <span className="flex-1 text-[11px] text-gray-700 truncate" title={url || display}>
                {display}
                {url && url !== display && (
                  <span className="text-gray-400 ml-2">→ {url}</span>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move up"
            >
              <ChevronUp size={12} />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === items.length - 1}
              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30"
              title="Move down"
            >
              <ChevronDown size={12} />
            </button>
            {item.type === 'custom' && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1 text-gray-400 hover:text-red-600"
                title="Remove"
              >
                <X size={12} />
              </button>
            )}
          </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <p className="text-[11px] text-gray-400 italic">
          {hiddenCount} item{hiddenCount === 1 ? '' : 's'} hidden — fill them on the Profile to enable here.
        </p>
      )}
    </div>
  );
}

import { type ReactNode, useId, useRef } from 'react';

export type TabDef = {
  key: string;
  label: ReactNode;
  hidden?: boolean;
};

type TabsProps = {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  children: ReactNode;
  className?: string;
  /** Accessible name for the tab list, e.g. "Profile sections". */
  ariaLabel?: string;
};

export default function Tabs({ tabs, value, onChange, children, className, ariaLabel }: TabsProps) {
  const visible = tabs.filter((t) => !t.hidden);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();
  const tabId = (key: string) => `${baseId}-tab-${key}`;
  const panelId = `${baseId}-panel`;

  function focusTab(next: TabDef | undefined) {
    if (!next) return;
    onChange(next.key);
    requestAnimationFrame(() => refs.current[next.key]?.focus());
  }

  function focusByOffset(currentKey: string, offset: number) {
    const idx = visible.findIndex((t) => t.key === currentKey);
    if (idx < 0) return;
    focusTab(visible[(idx + offset + visible.length) % visible.length]);
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={ariaLabel} className="tab-nav mb-6 overflow-x-auto">
        {visible.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              id={tabId(t.key)}
              role="tab"
              type="button"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.key)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  focusByOffset(t.key, 1);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  focusByOffset(t.key, -1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  focusTab(visible[0]);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  focusTab(visible[visible.length - 1]);
                }
              }}
              className={`tab-nav-link ${active ? 'tab-nav-link-active' : 'tab-nav-link-inactive'}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(value)}>
        {children}
      </div>
    </div>
  );
}

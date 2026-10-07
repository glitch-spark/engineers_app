import type { ReactNode } from 'react';

/** A shortcut key hint; `onColor` for use on a filled button. */
export default function Kbd({ children, onColor = false }: { children: ReactNode; onColor?: boolean }) {
  return (
    <kbd
      className={`rounded border px-1 font-mono text-[11px] font-medium leading-4 ${
        onColor
          ? 'border-white/40 bg-white/10 text-white'
          : 'border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
      }`}
    >
      {children}
    </kbd>
  );
}

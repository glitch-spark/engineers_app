import { useEffect } from 'react';

const APP_NAME = 'Engineer';

/** Gives each route its own tab title, e.g. "Leaderboard · Engineer" (WCAG 2.4.2). */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}

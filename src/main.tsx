import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeProvider';
import App from './App';
import './index.css';

// A deploy replaces the code chunks a tab already open was built with: its next lazy load (the PDF library for an
// interview brief or the Callers export) asks for a file that no longer exists. Reload once to pick up the new
// deploy; a second failure within RELOAD_GUARD_MS is left to the caller's error message, so this can't loop.
const RELOAD_GUARD_MS = 10_000;
window.addEventListener('vite:preloadError', (event) => {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem('chunk-reload-at')) || 0;
  } catch {
    /* storage blocked: still reload once */
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return;
  try {
    sessionStorage.setItem('chunk-reload-at', String(Date.now()));
  } catch {
    /* without storage the guard can't hold: reload anyway, the new deploy has the file */
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);

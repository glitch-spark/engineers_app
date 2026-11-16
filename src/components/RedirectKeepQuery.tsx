import { Navigate, useLocation } from 'react-router-dom';

/** Redirects an old URL to `to`, carrying the query string over so bookmarks keep their filters. */
export default function RedirectKeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

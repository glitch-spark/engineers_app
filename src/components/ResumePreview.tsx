import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { PageFormat } from '../lib/resumeStyles';

const MM_TO_PX = 96 / 25.4;
const PAGE_WIDTH_PX: Record<PageFormat, number> = {
  A3: 297 * MM_TO_PX,
  A4: 210 * MM_TO_PX,
  A5: 148 * MM_TO_PX,
  Letter: 8.5 * 96,
};

/** paged.js's Polisher injects <style> and <link> tags into document.head with
 *  various data-pagedjs-* attributes (resolved @page geometry, original/rendered
 *  stylesheets, etc.). Across re-renders they stack up and stale rules cascade
 *  unpredictably — wipe everything paged.js owns before each render so the new
 *  margins/page-size win cleanly. */
function clearPagedjsInsertedStyles() {
  document.head.querySelectorAll('style, link').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-pagedjs')) {
        el.remove();
        break;
      }
    }
  });
}

export default function ResumePreview({
  html,
  pageFormat,
  hint,
}: {
  html: string;
  pageFormat: PageFormat;
  hint?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [hostHeight, setHostHeight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let renderToken = 0;

    const run = async () => {
      const container = containerRef.current;
      if (!container) return;

      setRendering(true);
      setError(null);
      const myToken = ++renderToken;

      try {
        const { Previewer } = await import('pagedjs');
        if (cancelled || myToken !== renderToken) return;

        clearPagedjsInsertedStyles();
        container.innerHTML = '';
        const previewer = new Previewer();
        await previewer.preview(html, [], container);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Preview render failed');
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    const t = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [html]);

  useEffect(() => {
    return () => clearPagedjsInsertedStyles();
  }, []);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const host = containerRef.current;
    if (!scroll || !host) return;

    const recomputeScale = () => {
      const available = scroll.clientWidth - 32;
      const target = PAGE_WIDTH_PX[pageFormat];
      const next = Math.min(1, available / target);
      setScale(next > 0 ? next : 1);
    };

    const recomputeHeight = () => {
      setHostHeight(host.scrollHeight);
    };

    recomputeScale();
    recomputeHeight();

    const scrollRO = new ResizeObserver(recomputeScale);
    scrollRO.observe(scroll);
    const hostRO = new ResizeObserver(recomputeHeight);
    hostRO.observe(host);
    return () => {
      scrollRO.disconnect();
      hostRO.disconnect();
    };
  }, [pageFormat, html]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {rendering ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Rendering preview...
            </>
          ) : error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            <span>Paginated preview ({Math.round(scale * 100)}%)</span>
          )}
        </div>
      </div>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-100 border border-gray-200 rounded-md p-4">
        <div
          style={{
            width: `${PAGE_WIDTH_PX[pageFormat] * scale}px`,
            height: `${hostHeight * scale}px`,
          }}
        >
          <div
            ref={containerRef}
            className="pagedjs-host"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: `${PAGE_WIDTH_PX[pageFormat]}px`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

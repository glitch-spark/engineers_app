/**
 * File System Access API helpers. On Chromium browsers we cache one
 * `FileSystemDirectoryHandle` per session so multiple downloads write
 * directly to the user-picked folder without re-prompting.
 *
 * Falls back gracefully where the API isn't available (Firefox/Safari);
 * callers feature-detect via `isFsaSupported()`.
 */

type DirHandle = {
  // Just the bits we use; FileSystemDirectoryHandle isn't in standard libdom.
  getDirectoryHandle: (name: string, opts?: { create?: boolean }) => Promise<DirHandle>;
  getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{ write: (data: Blob | ArrayBuffer | Uint8Array) => Promise<void>; close: () => Promise<void> }>;
  }>;
  name: string;
};

declare global {
  interface Window {
    showDirectoryPicker?: (opts?: {
      mode?: 'read' | 'readwrite';
      startIn?: 'documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos' | DirHandle;
      id?: string;
    }) => Promise<DirHandle>;
  }
}

let cached: DirHandle | null = null;

export function isFsaSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Outcome of a picker invocation — lets the caller distinguish user
 *  cancel from a Chrome "blocked system folder" rejection so the UI can
 *  surface the right hint. */
export type PickError = 'cancelled' | 'blocked' | 'unsupported' | null;
let lastError: PickError = null;
export function lastPickError(): PickError { return lastError; }

/** Get the cached directory handle, prompting once per session if needed.
 *  Chrome refuses certain system folders (Downloads, Desktop, drive roots,
 *  etc.) with a "contains system files" error. We classify so the caller
 *  can show a clear hint instead of failing silently. */
export async function getDownloadDir(): Promise<DirHandle | null> {
  lastError = null;
  if (!isFsaSupported()) { lastError = 'unsupported'; return null; }
  if (cached) return cached;
  try {
    const handle = await window.showDirectoryPicker!({
      mode: 'readwrite',
      startIn: 'documents',
      id: 'engineer-resume-downloads',
    });
    cached = handle;
    return handle;
  } catch (err) {
    const msg = String((err as { message?: string })?.message || err);
    if (/system files|not allowed/i.test(msg)) lastError = 'blocked';
    else lastError = 'cancelled';
    return null;
  }
}

export function resetDownloadDir(): void {
  cached = null;
}

export function cachedDirName(): string | null {
  return cached?.name ?? null;
}

/** Write `data` to `<dir>/<path>/<filename>`. `path` may contain multiple
 *  segments separated by '/' (e.g. "ProfileName/CompanyName") — each
 *  segment is created if missing. */
export async function writeToFolder(
  dir: DirHandle,
  path: string,
  filename: string,
  data: Blob,
): Promise<void> {
  const segments = path.split('/').map((s) => s.trim()).filter(Boolean);
  let cur = dir;
  for (const seg of segments) {
    cur = await cur.getDirectoryHandle(seg, { create: true });
  }
  const file = await cur.getFileHandle(filename, { create: true });
  const stream = await file.createWritable();
  await stream.write(data);
  await stream.close();
}

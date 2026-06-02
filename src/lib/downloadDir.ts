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
  queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
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

async function _ensurePermission(handle: DirHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  let p = await handle.queryPermission({ mode: 'readwrite' });
  if (p === 'granted') return true;
  p = await handle.requestPermission({ mode: 'readwrite' });
  return p === 'granted';
}

/** Get the cached directory handle, prompting once per session if needed.
 *  Verifies the cached handle is still usable on each call — the OS can
 *  invalidate it between sessions (folder moved, deleted, perms revoked),
 *  which triggers the "state had changed" InvalidStateError when writing.
 *  Chrome refuses certain system folders (Downloads, Desktop, drive roots,
 *  etc.) with a "contains system files" error. We classify so the caller
 *  can show a clear hint instead of failing silently. */
export async function getDownloadDir(): Promise<DirHandle | null> {
  lastError = null;
  if (!isFsaSupported()) { lastError = 'unsupported'; return null; }
  if (cached) {
    const ok = await _ensurePermission(cached).catch(() => false);
    if (ok) return cached;
    cached = null;  // stale — fall through to re-prompt
  }
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

/** True if the error is the FSA stale-handle / missing-entry family that
 *  a re-prompt can recover from. Chrome wording: "An operation that
 *  depends on state cached in an interface object was made but the state
 *  had changed since it was read from disk." */
export function isStaleHandleError(err: unknown): boolean {
  const name = (err as { name?: string })?.name || '';
  const msg = String((err as { message?: string })?.message || err || '');
  return (
    name === 'InvalidStateError' ||
    name === 'NotFoundError' ||
    name === 'NotAllowedError' ||
    /state had changed|cached in an interface object|no longer exists|not found/i.test(msg)
  );
}

/** Resilient write — verifies handle, writes, and on stale-state error
 *  resets the cached handle, re-prompts the user, and retries once.
 *  Callers should pass a getter that re-resolves the dir each attempt. */
export async function writeToFolderResilient(
  path: string,
  filename: string,
  data: Blob,
): Promise<DirHandle | null> {
  let dir = await getDownloadDir();
  if (!dir) return null;
  try {
    await writeToFolder(dir, path, filename, data);
    return dir;
  } catch (err) {
    if (!isStaleHandleError(err)) throw err;
    resetDownloadDir();
    dir = await getDownloadDir();
    if (!dir) return null;
    await writeToFolder(dir, path, filename, data);
    return dir;
  }
}

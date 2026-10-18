// The focus picture store — GAUNTLET-BRIEF.md §7.5 and .gauntlet/PLAN.md "Picture (B)".
// IndexedDB database "onething", version 1, object store "media" (keyPath "id").
// localStorage is too small for a 10 MB GIF, so the Blob lives here and only its id goes into
// settings.focus.pictureId. Every function returns a Promise that can reject: callers wrap them
// in try/catch (or .catch) and keep the picture for this session as a blob: URL.
import { uid } from '../domain/rules';

const DB_NAME = 'onething';
const DB_VERSION = 1;
const STORE = 'media';

interface MediaRecord {
  id: string;
  name: string;
  type: string;
  blob: Blob;
  savedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    // A throw in here (no IndexedDB, SecurityError) rejects the promise; it never escapes.
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available.');
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Drop the cached connection if the browser closes it (site data cleared) or a newer
      // version opens elsewhere, so the next call opens a fresh one.
      db.onclose = () => { if (dbPromise === p) dbPromise = null; };
      db.onversionchange = () => { db.close(); if (dbPromise === p) dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB could not open.'));
  });
  dbPromise = p;
  p.catch(() => { if (dbPromise === p) dbPromise = null; }); // retry on the next call
  return p;
}

/** Run one request in its own transaction; resolve when the transaction has completed. */
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error ?? new Error('IndexedDB request failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

function isMediaRecord(x: unknown): x is MediaRecord {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === 'string' && r.blob instanceof Blob;
}

/** Store the picture and return its new id. The bytes are copied as they are (never
 *  re-encoded), so an animated GIF or WebP stays animated. */
export async function savePicture(blob: Blob, name: string): Promise<string> {
  // Copy into memory first: a File from the Android picker can be backed by a content URI
  // that is no longer readable after a restart.
  const copy = new Blob([await blob.arrayBuffer()], { type: blob.type });
  const rec: MediaRecord = { id: uid('p'), name, type: blob.type, blob: copy, savedAt: new Date().toISOString() };
  await run('readwrite', (s) => s.put(rec));
  return rec.id;
}

/** The saved picture, or null when no record has this id. */
export async function loadPicture(id: string): Promise<{ blob: Blob; name: string } | null> {
  const rec: unknown = await run('readonly', (s) => s.get(id));
  if (!isMediaRecord(rec)) return null;
  const type = typeof rec.type === 'string' ? rec.type : '';
  const blob = rec.blob.type || !type ? rec.blob : new Blob([rec.blob], { type });
  return { blob, name: typeof rec.name === 'string' && rec.name ? rec.name : 'Focus picture' };
}

/** Remove the record. Deleting an id that does not exist is not an error. */
export async function deletePicture(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

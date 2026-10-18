// Backup file: export and import (GAUNTLET-BRIEF §2 "Backup", §7.5; .gauntlet/PLAN.md item C).
// The file is the whole AppData object plus `exportedAt`, and the focus picture as base64 when one is saved.
// No network: the download is a Blob + object URL + <a download> click (web) or a share sheet (APK); import reads a local file.
import type { AppData } from '../domain/types';
import { appDayKey } from '../domain/dates';
import { todayKey } from '../domain/rules';
import { isAppData } from './storage';
import { defaultFocus, defaultSettings } from './seed';
import { loadPicture } from './media';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from '../app/native';

export interface BackupPicture { name: string; type: string; base64: string }

/** The file on disk. `picture` only when settings.focus.pictureId loads from media.ts. */
export type ExportFile = AppData & { exportedAt: string; picture?: BackupPicture };

/**
 * A checked backup, ready for replaceData. `data` has no extra fields and pictureId = null.
 * It is NOT repaired here: replaceData runs A's repairData (fills missing parts, moves tasks
 * beyond 3 to Idea parking). So do not trust optional fields like settings.dayBoundary before that.
 */
export interface ParsedBackup {
  data: AppData;
  picture: { blob: Blob; name: string } | null;
  /** The file had a picture, but it could not be read (bad base64, not an image, empty or too big). */
  badPicture: boolean;
  exportedAt: string | null;
}

const MAX_PICTURE_BYTES = 10 * 1024 * 1024; // same limit as the Focus picture (brief §7.5)
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // a real HH:MM time, 00:00–23:59

/** onething-backup-YYYY-MM-DD.json, where the date is the app day (late-night day rule). */
export function backupFileName(d: AppData, now: Date = new Date()): string {
  return 'onething-backup-' + todayKey(d, now) + '.json';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result); // data:<type>;base64,<data>
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64); // throws on bad base64
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * Build the file content. `settings.lastExportAt` in the file is set to the same moment as
 * `exportedAt`, so the file matches the phone after the caller commits lastExportAt = exportedAt.
 */
export async function buildExportFile(d: AppData, now: Date = new Date()): Promise<ExportFile> {
  const exportedAt = now.toISOString();
  const copy = structuredClone(d);
  copy.settings.lastExportAt = exportedAt;
  const file: ExportFile = { ...copy, exportedAt };
  const id = d.settings.focus?.pictureId;
  if (id) {
    try {
      const pic = await loadPicture(id);
      if (pic) file.picture = { name: pic.name, type: pic.blob.type, base64: await blobToBase64(pic.blob) };
    } catch {
      // IndexedDB failed: the backup still holds every plan, goal, idea and decision.
    }
  }
  return file;
}

/** Start the download in the browser. Returns the file size in bytes. Throws if the browser refuses. */
export function downloadExportFile(file: ExportFile, name: string): number {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    // Revoking at once can cancel the download on Android Chrome, so wait.
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return blob.size;
}

/**
 * APK (2026-10-18): Android WebView ignores <a download>, so the file is written to the app's
 * cache and handed to the phone's share sheet (Save to Drive, Files …). Returns the size in bytes,
 * or null when the user closed the share sheet without saving.
 */
async function shareExportFile(file: ExportFile, name: string): Promise<number | null> {
  const text = JSON.stringify(file, null, 2);
  const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: name, files: [uri] });
  } catch (err) {
    if (/cancel/i.test(String((err as { message?: string })?.message ?? err))) return null;
    throw err;
  }
  return new Blob([text]).size;
}

/**
 * Build + download (web) or build + share (APK) in one step. The caller then commits
 * settings.lastExportAt = exportedAt, unless `canceled` (the share sheet was closed).
 */
export async function exportBackup(d: AppData, now: Date = new Date()): Promise<{ name: string; bytes: number; exportedAt: string; hasPicture: boolean; shared: boolean; canceled: boolean }> {
  const file = await buildExportFile(d, now);
  const name = backupFileName(d, now);
  const base = { name, exportedAt: file.exportedAt, hasPicture: !!file.picture };
  if (isNative()) {
    const bytes = await shareExportFile(file, name);
    return { ...base, bytes: bytes ?? 0, shared: true, canceled: bytes === null };
  }
  return { ...base, bytes: downloadExportFile(file, name), shared: false, canceled: false };
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readPicture(x: unknown): { blob: Blob; name: string } | null {
  if (!isObject(x)) return null;
  const { name, type, base64 } = x;
  if (typeof name !== 'string' || typeof type !== 'string' || typeof base64 !== 'string') return null;
  if (type && !type.startsWith('image/')) return null;
  try {
    const blob = base64ToBlob(base64, type);
    if (blob.size === 0 || blob.size > MAX_PICTURE_BYTES) return null;
    return { blob, name: name || 'Focus picture' };
  } catch {
    return null;
  }
}

/**
 * Parse and check a backup file's text. Returns null when it is not a One Thing backup.
 * `exportedAt` and `picture` are taken off before the isAppData check, so `data` is plain AppData.
 */
export function parseBackup(text: string): ParsedBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(parsed) || parsed.version !== 1) return null;
  const { exportedAt, picture, ...rest } = parsed;
  if (!isAppData(rest)) return null; // A's check allows missing optional parts; replaceData repairs them

  const data: AppData = rest;
  // The old id points into the old phone's IndexedDB. Import sets the new id after savePicture.
  // Everything else (tasks beyond 3 → Idea parking, missing settings) is left to repairData.
  data.settings.focus = { ...defaultFocus(), ...data.settings.focus, pictureId: null };

  const pic = picture === undefined || picture === null ? null : readPicture(picture);
  const when = typeof exportedAt === 'string' && !Number.isNaN(Date.parse(exportedAt)) ? exportedAt : null;
  return { data, picture: pic, badPicture: picture !== undefined && picture !== null && !pic, exportedAt: when };
}

/**
 * The app day the backup was made, for "This backup is from …" (same date as the file name).
 * Never throws: a missing or bad dayBoundary uses the default 05:30; any other problem → null.
 */
export function backupDayKey(b: ParsedBackup): string | null {
  if (!b.exportedAt) return null;
  try {
    const raw: unknown = b.data.settings?.dayBoundary;
    const boundary = typeof raw === 'string' && CLOCK_RE.test(raw) ? raw : defaultSettings().dayBoundary;
    const key = appDayKey(new Date(b.exportedAt), boundary);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
  } catch {
    return null;
  }
}

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import type { Goal } from '../domain/types';
import { daysSince, fmtDate, ymd } from '../domain/dates';
import { addGoal, goalMeta, todayKey, toggleGoal, updateGoal } from '../domain/rules';
import { backupDayKey, exportBackup as downloadBackup, parseBackup, type ParsedBackup } from '../data/backup';
import { deletePicture, savePicture } from '../data/media';
import { Icon } from '../ui/Icon';

interface PendingImport { backup: ParsedBackup; when: string }

export function GoalsScreen() {
  const { data, commit, replaceData, toast, picture, setPicture } = useApp();
  const [showSettings, setShowSettings] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [adding, setAdding] = useState(false);
  const [newGoal, setNewGoal] = useState('');
  const [backupNote, setBackupNote] = useState('');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exporting = useRef(false); // one tap = one download, even on a double tap
  const busy = useRef(false); // one import at a time

  const today = todayKey(data);
  const active = data.goals.filter((g) => g.status === 'active');
  const paused = data.goals.filter((g) => g.status === 'paused');
  const since = daysSince(data.settings.lastExportAt);
  const late = since === null || since > 7;

  function toggle(id: string) {
    const g = commit((d) => {
      const x = toggleGoal(d, id);
      return x ? x.status : null;
    });
    if (g) toast(g === 'active' ? 'Goal resumed.' : 'Goal paused. It is not deleted.');
  }

  function startEdit(g: Goal) { setEditId(g.id); setEditText(g.text); setAdding(false); }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    const text = editText.trim();
    if (!text || !editId) { toast('A goal needs a name.'); return; }
    commit((d) => updateGoal(d, editId, text));
    setEditId(null);
    toast('Goal saved.');
  }

  function saveNew(e: FormEvent) {
    e.preventDefault();
    const text = newGoal.trim();
    if (!text) { toast('Write the goal first.'); return; }
    commit((d) => addGoal(d, text));
    setNewGoal('');
    setAdding(false);
    toast('Goal added.');
  }

  function setTime(key: 'planTime' | 'dayBoundary', value: string) {
    if (/^\d{2}:\d{2}$/.test(value)) commit((d) => { d.settings[key] = value; });
  }

  async function exportBackup() {
    // The lock is taken before anything else and released only after a short pause once the
    // download has started. Without a picture there is no await gap, so releasing at once
    // would let the second tap of a double tap start a second download.
    if (exporting.current) return;
    exporting.current = true;
    setPending(null);
    setBackupNote('');
    try {
      const out = await downloadBackup(data, new Date());
      if (out.canceled) {
        setBackupNote('Not saved yet. Tap Export backup again and pick a place, for example Google Drive.');
        return;
      }
      commit((d) => { d.settings.lastExportAt = out.exportedAt; });
      const kb = Math.max(1, Math.round(out.bytes / 1024));
      if (out.shared) {
        setBackupNote('Saved ' + out.name + ' (' + kb + ' KB) where you picked. Keep it, for example in Google Drive.');
        toast('Backup saved.');
      } else {
        setBackupNote('Downloaded ' + out.name + ' (' + kb + ' KB). Look for it in your Downloads.');
        toast('Backup downloaded.');
      }
    } catch {
      setBackupNote('The backup file could not be made. Try again.');
    } finally {
      window.setTimeout(() => { exporting.current = false; }, 1500);
    }
  }

  function pickFile() {
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let backup: ParsedBackup | null = null;
      try { backup = parseBackup(String(reader.result)); } catch { backup = null; }
      if (!backup) {
        setPending(null);
        setBackupNote('This file is not a One Thing backup. Pick a file named onething-backup-….json.');
        return;
      }
      // The date is only a label: a bad value must never block the confirm notice.
      let when = 'an unknown date';
      try {
        const key = backupDayKey(backup) ?? (file.lastModified ? ymd(new Date(file.lastModified)) : null);
        if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) when = fmtDate(key);
      } catch { /* keep "an unknown date" */ }
      setPending({ backup, when });
      setBackupNote('');
    };
    reader.onerror = () => setBackupNote('The file could not be read. Try again.');
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!pending || busy.current) return;
    busy.current = true;
    const { data: next, picture: pic, badPicture } = pending.backup;
    const oldPictureId = data.settings.focus?.pictureId ?? null;
    setPending(null);
    setBackupNote('');
    try {
      replaceData(next); // exportedAt and picture are already stripped; pictureId is null
      if (picture) URL.revokeObjectURL(picture.url);
      setPicture(pic ? { url: URL.createObjectURL(pic.blob), name: pic.name } : null);
      let msg = badPicture ? 'Backup imported. The focus picture in the file could not be read.' : 'Backup imported.';
      if (pic) {
        try {
          const id = await savePicture(pic.blob, pic.name);
          commit((d) => { d.settings.focus.pictureId = id; });
        } catch {
          msg = 'Backup imported. Picture shown, but not saved on this phone.';
        }
      }
      toast(msg);
      // The old picture belonged to the data that was just replaced.
      if (oldPictureId) {
        try { await deletePicture(oldPictureId); } catch { /* an unused record only costs space */ }
      }
    } finally {
      busy.current = false;
    }
  }

  // A plain render function, not a nested component: a nested component would be a new type
  // on every render, so React would remount the row and the edit box would lose the cursor.
  function goalRow(g: Goal) {
    if (editId === g.id) {
      return (
        <div className="card" style={{ padding: 12, gap: 8 }} key={g.id}>
          <label className="lbl" htmlFor="goal-edit">Edit goal</label>
          <form className="inline-form" onSubmit={saveEdit}>
            <input className="field" id="goal-edit" type="text" maxLength={100} autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} />
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
          <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setEditId(null)}>Cancel</button>
        </div>
      );
    }
    const isActive = g.status === 'active';
    const meta = goalMeta(g, today);
    return (
      <div className={'goal' + (isActive ? '' : ' goal-paused')} key={g.id}>
        <button type="button" className="goal-text" aria-label={'Edit goal: ' + g.text} onClick={() => startEdit(g)}>
          <span className="goal-title">{g.text}</span>
          {meta && <span className="count">{meta}</span>}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => toggle(g.id)}>{isActive ? 'Pause' : 'Resume'}</button>
      </div>
    );
  }

  return (
    <>
      <header className="head-row">
        <div className="head">
          <p className="sub">Every decision is checked against these</p>
          <h1>Goals</h1>
        </div>
        <button type="button" className="btn btn-sm icon-btn" aria-expanded={showSettings} aria-label="Settings" onClick={() => setShowSettings(!showSettings)}>
          <Icon name="sliders" size={20} />
        </button>
      </header>

      {showSettings && (
        <section className="card" aria-label="Settings">
          <h2>Settings</h2>
          <div className="btn-grid">
            <div className="stack" style={{ gap: 4 }}>
              <label className="lbl" htmlFor="set-plan">Night plan time</label>
              <input className="field" id="set-plan" type="time" value={data.settings.planTime} onChange={(e) => setTime('planTime', e.target.value)} />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <label className="lbl" htmlFor="set-boundary">My day ends at</label>
              <input className="field" id="set-boundary" type="time" value={data.settings.dayBoundary} onChange={(e) => setTime('dayBoundary', e.target.value)} />
            </div>
          </div>
          <p className="sub">Until this time, the app still shows the same day. Useful if you stay up late or work at night.</p>
        </section>
      )}

      <section className="stack" aria-label="Active goals">
        <div className="row-between">
          <h2>Active</h2>
          <span className="count">{active.length + (active.length === 1 ? ' goal' : ' goals')}</span>
        </div>
        {active.map((g) => goalRow(g))}
        {adding ? (
          <div className="stack" style={{ gap: 6 }}>
            <label className="lbl" htmlFor="goal-new">New goal</label>
            <form className="inline-form" onSubmit={saveNew}>
              <input className="field" id="goal-new" type="text" maxLength={100} placeholder="A goal for the next 90 days" autoFocus value={newGoal} onChange={(e) => setNewGoal(e.target.value)} />
              <button type="submit" className="btn btn-primary">Add</button>
            </form>
            <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="btn btn-dashed" onClick={() => { setAdding(true); setEditId(null); }}>
            <Icon name="plus" size={20} width={2} />
            <span>Add a goal</span>
          </button>
        )}
      </section>

      <section className="stack" aria-label="Paused goals">
        <div className="row-between">
          <h2>Paused</h2>
          <span className="count">{paused.length + (paused.length === 1 ? ' goal' : ' goals')}</span>
        </div>
        <p className="sub">Paused goals wait here. They are not deleted.</p>
        {paused.length ? paused.map((g) => goalRow(g)) : <p className="placeholder">Nothing paused.</p>}
      </section>

      <section className="card" aria-label="Backup">
        <h2>Backup</h2>
        <p className="sub">Your data lives only on this phone. Save a backup file once a week.</p>
        <p className="sub" style={{ fontWeight: 700, color: late ? 'var(--warn-ink)' : 'var(--accent-strong)' }}>
          {since === null ? 'No backup yet' : 'Last backup: ' + (since === 0 ? 'today' : since + (since === 1 ? ' day ago' : ' days ago'))}
        </p>
        <div className="btn-grid">
          <button type="button" className="btn btn-primary" onClick={exportBackup}>Export backup</button>
          <button type="button" className="btn" onClick={pickFile}>Import</button>
        </div>
        <input ref={fileRef} type="file" id="import-file" accept="application/json,.json" hidden onChange={onFile} />
        {backupNote && <div className="notice" role="status"><p>{backupNote}</p></div>}
        {pending && (
          <div className="notice" role="alert">
            <p><strong>Replace all your data?</strong> This backup is from {pending.when}. Your plans, goals, ideas, decisions and focus picture on this phone will be replaced.</p>
            <div className="btn-row">
              <button type="button" className="btn btn-sm btn-dark" onClick={confirmImport}>Replace my data</button>
              <button type="button" className="btn btn-sm" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

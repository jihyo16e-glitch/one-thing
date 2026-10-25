import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import type { Goal, GoalLevel } from '../domain/types';
import { daysSince, fmtDate, ymd } from '../domain/dates';
import {
  GOAL_SOFT_MAX, LATE_NUMBER_MIN, LEVELS, addGoal, addPause, backupDue, checkDue, deleteGoal, dropGoal, finishGoal, getGoal,
  goalMark, goalMeta, goalsAtLevel, lateNumber, markLabel, overdueGoals, parentLevel, removePause, reopenGoal, saveGoal,
  todayKey, toggleGoal,
} from '../domain/rules';
import { backupDayKey, exportBackup as downloadBackup, parseBackup, type ParsedBackup } from '../data/backup';
import { deletePicture, savePicture } from '../data/media';
import { canTrackPhone } from '../app/screenTime';
import { Icon } from '../ui/Icon';
import { MonthCheck, monthName } from './MonthCheck';

interface PendingImport { backup: ParsedBackup; when: string }
/** The goal form (add and edit): name, level (year / month / week), the bigger goal it is part of, planned day. */
interface GoalDraft { text: string; level: GoalLevel | ''; parentId: string; date: string }
const EMPTY_GOAL: GoalDraft = { text: '', level: '', parentId: '', date: '' };
interface PauseDraft { from: string; to: string; reason: string }

export function GoalsScreen() {
  const { data, commit, replaceData, toast, picture, setPicture, scrollTop, go } = useApp();
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<GoalDraft>(EMPTY_GOAL);
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<GoalDraft>(EMPTY_GOAL);
  const [checking, setChecking] = useState<string | null>(null); // the month being checked
  const [pauseDraft, setPauseDraft] = useState<PauseDraft | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false); // inside the open edit box
  const [tooMany, setTooMany] = useState(false); // "you already have 3 goals here" before adding one more
  const [backupNote, setBackupNote] = useState('');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exporting = useRef(false); // one tap = one download, even on a double tap
  const busy = useRef(false); // one import at a time

  const today = todayKey(data);
  const active = data.goals.filter((g) => g.status === 'active');
  const paused = data.goals.filter((g) => g.status === 'paused');
  const finished = data.goals
    .filter((g) => g.status === 'done' || g.status === 'dropped')
    .sort((a, b) => (b.doneDate ?? '').localeCompare(a.doneDate ?? ''));
  const leveled = active.some((g) => g.level);
  const due = checkDue(data, today);
  const overdue = overdueGoals(data, today);
  const late = lateNumber(data);
  const since = daysSince(data.settings.lastExportAt);
  const backupLate = backupDue(data); // not on day 1: a new user does not know why yet

  function toggle(id: string) {
    const g = commit((d) => {
      const x = toggleGoal(d, id);
      return x ? x.status : null;
    });
    if (g) toast(g === 'active' ? 'Goal resumed.' : 'Goal paused. It is not deleted.');
  }

  function startEdit(g: Goal) {
    setEditId(g.id);
    setEdit({ text: g.text, level: g.level ?? '', parentId: g.parentId ?? '', date: g.date ?? '' });
    setAdding(false);
    setConfirmDelete(false);
  }

  function removeGoal(id: string) {
    commit((d) => deleteGoal(d, id));
    setEditId(null);
    setConfirmDelete(false);
    toast('Goal deleted.');
  }

  function levelMax(level: GoalLevel | ''): number {
    return level ? GOAL_SOFT_MAX : GOAL_SOFT_MAX + 2;
  }

  function fields(f: GoalDraft) {
    return { level: f.level || undefined, parentId: f.parentId || undefined, date: f.date || undefined };
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault();
    const text = edit.text.trim();
    if (!text || !editId) { toast('A goal needs a name.'); return; }
    commit((d) => saveGoal(d, editId, text, fields(edit), today));
    setEditId(null);
    toast('Goal saved.');
  }

  function markDone(id: string) {
    const mark = commit((d) => {
      const g = finishGoal(d, id, today);
      return g ? goalMark(g) : null;
    });
    setEditId(null);
    toast(mark ? 'Goal done. ' + markLabel(mark) + '.' : 'Goal done.');
  }

  function drop(id: string) {
    commit((d) => dropGoal(d, id, today));
    setEditId(null);
    toast('Goal dropped. That is OK.');
  }

  function reopen(id: string) {
    commit((d) => reopenGoal(d, id));
    toast('Goal is active again.');
  }

  function saveNew(e?: FormEvent, anyway = false) {
    e?.preventDefault();
    const text = add.text.trim();
    if (!text) { toast('Write the goal first.'); return; }
    if (!anyway && goalsAtLevel(data, add.level || undefined) >= levelMax(add.level)) { setTooMany(true); return; }
    commit((d) => addGoal(d, text, fields(add)));
    setAdd(EMPTY_GOAL);
    setAdding(false);
    setTooMany(false);
    toast('Goal added.');
  }

  function startCheck(month: string) {
    setChecking(month);
    setEditId(null);
    setAdding(false);
    scrollTop();
  }

  function savePause(e: FormEvent) {
    e.preventDefault();
    if (!pauseDraft) return;
    const { from, to, reason } = pauseDraft;
    if (!from || !to) { toast('Pick the first and the last day.'); return; }
    if (to < from) { toast('The last day must be on or after the first day.'); return; }
    const moved = commit((d) => addPause(d, from, to, reason.trim()));
    setPauseDraft(null);
    toast('Plan paused. ' + moved + (moved === 1 ? ' goal moved.' : ' goals moved.'));
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

  // Plain render functions, not nested components: a nested component would be a new type on every
  // render, so React would remount the row and the edit box would lose the cursor.
  function goalFields(f: GoalDraft, setF: (next: GoalDraft) => void, prefix: string, selfId: string | null) {
    const want = parentLevel(f.level || undefined);
    const parents = want ? active.filter((g) => g.level === want && g.id !== selfId) : [];
    return (
      <>
        <div className="btn-grid">
          <div className="stack" style={{ gap: 4 }}>
            <label className="lbl" htmlFor={prefix + '-level'}>Level</label>
            <select className="field" id={prefix + '-level'} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as GoalLevel | '', parentId: '' })}>
              <option value="">No level</option>
              {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="lbl" htmlFor={prefix + '-date'}>Planned day</label>
            <input className="field" type="date" id={prefix + '-date'} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
        </div>
        {parents.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <label className="lbl" htmlFor={prefix + '-parent'}>Part of</label>
            <select className="field" id={prefix + '-parent'} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
              <option value="">Not linked</option>
              {parents.map((g) => <option key={g.id} value={g.id}>{g.text}</option>)}
            </select>
          </div>
        )}
      </>
    );
  }

  function goalRow(g: Goal) {
    if (editId === g.id) {
      return (
        <div className="card" style={{ padding: 12, gap: 10 }} key={g.id}>
          <form className="stack" style={{ gap: 10 }} onSubmit={saveEdit}>
            <label className="lbl" htmlFor="goal-edit">Edit goal</label>
            <div className="inline-form">
              <input className="field" id="goal-edit" type="text" maxLength={100} autoFocus value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
            {goalFields(edit, setEdit, 'goal-edit', g.id)}
          </form>
          <div className="btn-row">
            {g.status === 'active' && (
              <button type="button" className="btn btn-sm" onClick={() => markDone(g.id)}>
                <Icon name="check" size={18} width={2.4} />
                <span>Mark done</span>
              </button>
            )}
            {g.status === 'active' && <button type="button" className="btn btn-sm" onClick={() => drop(g.id)}>Drop it</button>}
            <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={18} />
              <span>Delete</span>
            </button>
            <button type="button" className="btn btn-sm btn-quiet" onClick={() => setEditId(null)}>Cancel</button>
          </div>
          {confirmDelete && (
            <div className="notice" role="alert">
              <p><strong>Delete this goal for good?</strong> To keep it for later, use Pause instead. A dropped goal still counts in your late number; a deleted one does not.</p>
              <div className="btn-row">
                <button type="button" className="btn btn-sm btn-dark" onClick={() => removeGoal(g.id)}>Delete goal</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </div>
            </div>
          )}
        </div>
      );
    }
    const isActive = g.status === 'active';
    const meta = goalMeta(g, today);
    const isLate = isActive && !!g.date && g.date < today;
    const parent = g.parentId ? getGoal(data, g.parentId) : null;
    return (
      <div className={'goal' + (isActive ? '' : ' goal-paused')} key={g.id}>
        <button type="button" className="goal-text" aria-label={'Edit goal: ' + g.text} onClick={() => startEdit(g)}>
          <span className="goal-title">{g.text}</span>
          {meta && <span className="count" style={isLate ? { color: 'var(--warn-ink)', fontWeight: 700 } : undefined}>{meta}</span>}
          {parent && <span className="count">Part of: {parent.text}</span>}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => toggle(g.id)}>{isActive ? 'Pause' : 'Resume'}</button>
      </div>
    );
  }

  function finishedRow(g: Goal) {
    const mark = goalMark(g);
    return (
      <div className="goal goal-paused" key={g.id}>
        <div className="goal-text" style={{ cursor: 'default' }}>
          <span className="goal-title">{g.text}</span>
          <span className="count">{(mark ? markLabel(mark) : '✅ Done') + (g.doneDate ? ' · ' + fmtDate(g.doneDate) : '')}</span>
          {g.note && <span className="count">{g.note}</span>}
        </div>
        <button type="button" className="btn btn-sm" aria-label={'Reopen goal: ' + g.text} onClick={() => reopen(g.id)}>Reopen</button>
      </div>
    );
  }

  // Settings are a card at the end of this screen, always open: behind a small icon, new users never found them.
  const header = (
    <header className="head">
      <p className="sub">Every decision is checked against these</p>
      <h1>Goals</h1>
    </header>
  );

  if (checking) {
    return (
      <>
        {header}
        <MonthCheck month={checking} onClose={() => { setChecking(null); scrollTop(); }} />
      </>
    );
  }

  return (
    <>
      {header}

      {due && (
        <section className="card card-hi" aria-label="Month check is due">
          <p className="eyebrow">Month check</p>
          <h2>Check {monthName(due)} from memory</h2>
          <p className="sub">Write your goals without looking. Then mark each one: done, moved or dropped.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => startCheck(due)}>Start the check</button>
        </section>
      )}

      {!due && overdue.length > 0 && (
        <div className="notice" role="status">
          <p><strong>{overdue.length === 1 ? '1 goal is' : overdue.length + ' goals are'} past the planned day.</strong> That is normal. Mark it done, move it, or drop it.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm btn-dark" onClick={() => startCheck(today.slice(0, 7))}>Check now</button>
          </div>
        </div>
      )}

      <section className="stack" aria-label="Active goals">
        <div className="row-between">
          <h2>Active</h2>
          <span className="count">{active.length + (active.length === 1 ? ' goal' : ' goals')}</span>
        </div>
        {leveled ? (
          <>
            {LEVELS.map((l) => {
              const list = active.filter((g) => g.level === l.id);
              return list.length ? (
                <div className="stack" key={l.id} aria-label={l.head}>
                  <span className="soft-label">{l.head}</span>
                  {list.map((g) => goalRow(g))}
                </div>
              ) : null;
            })}
            {active.some((g) => !g.level) && (
              <div className="stack" aria-label="Other goals">
                <span className="soft-label">Other goals</span>
                {active.filter((g) => !g.level).map((g) => goalRow(g))}
              </div>
            )}
          </>
        ) : active.map((g) => goalRow(g))}
        {adding ? (
          <form className="stack" style={{ gap: 10 }} onSubmit={saveNew}>
            <label className="lbl" htmlFor="goal-new">New goal</label>
            <div className="inline-form">
              <input className="field" id="goal-new" type="text" maxLength={100} placeholder="A goal for the next 90 days" autoFocus value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} />
              <button type="submit" className="btn btn-primary">Add</button>
            </div>
            {goalFields(add, (next) => { setAdd(next); setTooMany(false); }, 'goal-new', null)}
            {tooMany && (
              <div className="notice" role="status">
                <p>
                  <strong>You already have {goalsAtLevel(data, add.level || undefined)} {add.level ? LEVELS.find((l) => l.id === add.level)?.label.toLowerCase() + ' goals' : 'goals without a level'}.</strong>{' '}
                  Fewer goals go deeper. Pause one first, or add this one anyway.
                </p>
                <div className="btn-row">
                  <button type="button" className="btn btn-sm btn-dark" onClick={() => saveNew(undefined, true)}>Add anyway</button>
                  <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setTooMany(false); }}>Cancel</button>
                </div>
              </div>
            )}
            <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => { setAdding(false); setTooMany(false); }}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="btn btn-dashed" onClick={() => { setAdding(true); setEditId(null); setAdd(EMPTY_GOAL); }}>
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

      <section className="card" aria-label="Your late number">
        <div className="row-between">
          <h2>Your late number</h2>
          {late.ratio !== null && <span className="badge badge-accent">{late.count} goals</span>}
        </div>
        {late.ratio === null ? (
          <p className="sub">
            Finish {LATE_NUMBER_MIN - late.count} more {LATE_NUMBER_MIN - late.count === 1 ? 'goal' : 'goals'} that had a planned day.
            Then you see how long your goals really take, compared with your guess.
          </p>
        ) : (
          <>
            <p className="one-text">{late.ratio.toFixed(1)}x</p>
            <p className="sub">
              {late.ratio > 1.1
                ? 'Your goals take ' + late.ratio.toFixed(1) + 'x your guess. Give new goals ' + late.ratio.toFixed(1) + 'x the time.'
                : late.ratio < 0.9
                  ? 'You finish before your planned day. Make new goals a little bigger.'
                  : 'Your guesses are good. Keep planning this way.'}
            </p>
          </>
        )}
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => startCheck(today.slice(0, 7))}>Do a month check now</button>
      </section>

      <section className="stack" aria-label="Done and dropped goals">
        <div className="row-between">
          <h2>Done and dropped</h2>
          <span className="count">{finished.length + (finished.length === 1 ? ' goal' : ' goals')}</span>
        </div>
        {finished.length ? (
          <>
            {(showAllDone ? finished : finished.slice(0, 5)).map((g) => finishedRow(g))}
            {finished.length > 5 && (
              <button type="button" className="link-quiet" onClick={() => setShowAllDone(!showAllDone)}>
                {showAllDone ? 'Show fewer' : 'Show all ' + finished.length}
              </button>
            )}
          </>
        ) : <p className="placeholder">Nothing yet. Tap a goal to mark it done or drop it.</p>}
      </section>

      <section className="card" aria-label="Pause my plan">
        <h2>Pause my plan</h2>
        <p className="sub">For a wedding, a trip or a sick week. Goal days move by the same number of days, so nothing counts as late.</p>
        {data.pauses.map((p) => (
          <div className="soft" key={p.id}>
            <div className="stack" style={{ gap: 2, minWidth: 0 }}>
              <span className="soft-label">{p.reason || 'Pause'}</span>
              <span>{fmtDate(p.from) + ' – ' + fmtDate(p.to)}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'var(--surface)', borderColor: 'var(--surface)', color: 'var(--accent-strong)', fontWeight: 700, flex: 'none' }}
              aria-label={'Remove pause: ' + (p.reason || 'Pause')}
              onClick={() => { commit((d) => removePause(d, p.id)); toast('Pause removed. Goal days stay where they are.'); }}
            >
              Remove
            </button>
          </div>
        ))}
        {pauseDraft ? (
          <form className="stack" onSubmit={savePause}>
            <div className="btn-grid">
              <div className="stack" style={{ gap: 4 }}>
                <label className="lbl" htmlFor="pause-from">First day</label>
                <input className="field" type="date" id="pause-from" value={pauseDraft.from} onChange={(e) => setPauseDraft({ ...pauseDraft, from: e.target.value })} />
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <label className="lbl" htmlFor="pause-to">Last day</label>
                <input className="field" type="date" id="pause-to" value={pauseDraft.to} onChange={(e) => setPauseDraft({ ...pauseDraft, to: e.target.value })} />
              </div>
            </div>
            <label className="lbl" htmlFor="pause-reason">Why (optional)</label>
            <input className="field" type="text" id="pause-reason" maxLength={60} placeholder="For example: wedding" value={pauseDraft.reason} onChange={(e) => setPauseDraft({ ...pauseDraft, reason: e.target.value })} />
            <div className="btn-row">
              <button type="submit" className="btn btn-sm btn-primary">Save pause</button>
              <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPauseDraft(null)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-dashed" onClick={() => setPauseDraft({ from: today, to: today, reason: '' })}>
            <Icon name="plus" size={20} width={2} />
            <span>Add a pause</span>
          </button>
        )}
      </section>

      <section className="card" aria-label="Backup">
        <h2>Backup</h2>
        <p className="sub">Your data lives only on this phone. Save a backup file once a week.</p>
        <p className="sub" style={{ fontWeight: 700, color: backupLate ? 'var(--warn-ink)' : 'var(--accent-strong)' }}>
          {since === null ? (backupLate ? 'No backup yet' : 'No backup yet. Save one after your first week.') : 'Last backup: ' + (since === 0 ? 'today' : since + (since === 1 ? ' day ago' : ' days ago'))}
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

      <section className="card" aria-label="Settings">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sliders" size={20} />
          <span>Settings</span>
        </h2>
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
        {canTrackPhone() && (
          <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => go('phone')}>
            <Icon name="phone" size={20} />
            <span>Phone time and the scroll bubble</span>
          </button>
        )}
        {/* the live address: in the APK, Capacitor opens other hosts in the phone's browser, so the app is never left */}
        <a className="link-quiet" style={{ alignSelf: 'flex-start', paddingInline: 0 }} href="https://one-thing-xi.vercel.app/privacy.html" target="_blank" rel="noopener noreferrer">
          Privacy policy: your data stays on this phone
        </a>
      </section>
    </>
  );
}

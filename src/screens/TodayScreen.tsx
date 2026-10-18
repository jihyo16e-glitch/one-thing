import { useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useApp } from '../app/AppContext';
import { addDays, fmtDay, isEvening } from '../domain/dates';
import { MAX_TASKS, addIdea, addTask, ensureDay, getDay, getGoal, hasPlan, pendingDecisions, removeTask, setOneText, todayKey, updateTask } from '../domain/rules';
import { Header } from '../ui/Header';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';
import { buzz, popOnce, useFlip } from '../ui/motion';

export function TodayScreen() {
  const { data, commit, go, toast, openDecision, cheer } = useApp();
  const [adding, setAdding] = useState(false);
  const [overflow, setOverflow] = useState('');
  const [newTask, setNewTask] = useState('');
  const [quickOne, setQuickOne] = useState('');
  const [oneDraft, setOneDraft] = useState<string | null>(null); // null = not editing the ONE thing
  const [taskEdit, setTaskEdit] = useState<{ id: string; text: string } | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null); // drops in with a soft tint
  const tasksRef = useRef<HTMLElement>(null);

  const now = new Date();
  const key = todayKey(data, now);
  const day = getDay(data, key);
  // Rows glide when a task is added, deleted or opened for editing.
  useFlip(tasksRef, (day?.tasks.map((t) => t.id).join(',') ?? '') + '|' + (taskEdit?.id ?? '') + '|' + adding + '|' + overflow);
  const evening = isEvening(now, data.settings.planTime, data.settings.dayBoundary);
  const tomorrowDay = getDay(data, addDays(key, 1));
  const tomorrowPlanned = hasPlan(data, addDays(key, 1));
  const goal = day?.one.goalId ? getGoal(data, day.one.goalId) : null;

  function toggleOne(e: MouseEvent<HTMLButtonElement>) {
    const doneNow = commit((d) => {
      const x = getDay(d, key);
      if (!x) return false;
      x.one.done = !x.one.done;
      x.one.doneAt = x.one.done ? new Date().toISOString() : null;
      return x.one.done;
    });
    if (doneNow) {
      popOnce(e.currentTarget); // spring + a soft ring (styles.css .check-lg.pop)
      buzz(14);
      cheer(); // the seed jumps once
      toast('ONE thing done. Well done.');
    }
  }

  function toggleTask(id: string, e: MouseEvent<HTMLButtonElement>) {
    const doneNow = commit((d) => {
      const t = getDay(d, key)?.tasks.find((x) => x.id === id);
      if (t) t.done = !t.done;
      return !!t?.done;
    });
    if (doneNow) {
      popOnce(e.currentTarget);
      buzz(8);
    }
  }

  function saveQuickOne(e: FormEvent) {
    e.preventDefault();
    const text = quickOne.trim();
    if (!text) { toast('Write your ONE thing first.'); return; }
    commit((d) => {
      const x = ensureDay(d, key);
      x.one.text = text;
      x.plannedAt = new Date().toISOString();
    });
    setQuickOne('');
    toast('Saved. This is your ONE thing today.');
  }

  function saveTask(e: FormEvent) {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) { toast('Write the task first.'); return; }
    const addedId = commit((d) => (addTask(d, key, text) ? getDay(d, key)?.tasks.at(-1)?.id ?? null : null));
    setAdding(false);
    setNewTask('');
    if (addedId) {
      setJustAdded(addedId);
      toast('Task added.');
    } else setOverflow(text); // the 4th task is refused and offered to Idea parking
  }

  function overflowToIdeas() {
    commit((d) => addIdea(d, overflow, 'overflow'));
    setOverflow('');
    toast('Parked in Ideas.');
  }

  function saveOneEdit(e: FormEvent) {
    e.preventDefault();
    const text = (oneDraft ?? '').trim();
    if (!text) { toast('Write your ONE thing first.'); return; }
    commit((d) => setOneText(d, key, text));
    setOneDraft(null);
    toast('ONE thing changed.');
  }

  function saveTaskEdit(e: FormEvent) {
    e.preventDefault();
    if (!taskEdit) return;
    const text = taskEdit.text.trim();
    if (!text) { toast('Write the task first.'); return; }
    commit((d) => updateTask(d, key, taskEdit.id, text));
    setTaskEdit(null);
    toast('Task changed.');
  }

  function deleteTask() {
    if (!taskEdit) return;
    commit((d) => removeTask(d, key, taskEdit.id));
    setTaskEdit(null);
    toast('Task deleted.');
  }

  const left = day ? MAX_TASKS - day.tasks.length : MAX_TASKS;

  return (
    <>
      <Header sub={fmtDay(key)} title="Today" />

      {evening && !tomorrowPlanned && (
        <section className="card card-hi" aria-label="Plan tomorrow">
          <div className="mascot-row">
            <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plan" size={20} />
              <span>It is plan time</span>
            </p>
            <Mascot mood="sleepy" size={64} pad={16} />
          </div>
          <p className="one-text" style={{ fontSize: 21 }}>Plan tomorrow now, while your mind is fresh.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => go('plan')}>Plan tomorrow</button>
        </section>
      )}

      {tomorrowPlanned && tomorrowDay && (
        <section className="soft" aria-label="Tomorrow is planned">
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span className="soft-label">Tomorrow is planned</span>
            <span style={{ overflowWrap: 'anywhere' }}>{tomorrowDay.one.text}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--surface)', color: 'var(--accent-strong)', fontWeight: 700, flex: 'none' }}
            onClick={() => go('plan')}
          >
            Edit
          </button>
        </section>
      )}

      {day && day.one.text ? (
        <>
          <section className="card" aria-label="Your ONE thing">
            <div className="row-between" style={{ alignItems: 'center' }}>
              <p className="eyebrow">Your ONE thing</p>
              {oneDraft === null && (
                <button type="button" className="edit-link" aria-label="Edit your ONE thing" onClick={() => setOneDraft(day.one.text)}>
                  Edit
                </button>
              )}
            </div>
            {oneDraft !== null ? (
              <form className="stack" onSubmit={saveOneEdit}>
                <input className="field field-lg" id="one-edit" type="text" maxLength={140} aria-label="Your ONE thing" autoFocus value={oneDraft} onChange={(e) => setOneDraft(e.target.value)} />
                <div className="btn-row">
                  <button type="submit" className="btn btn-sm btn-primary">Save</button>
                  <button type="button" className="btn btn-sm btn-quiet" onClick={() => setOneDraft(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <div className="one-row">
                  <button
                    type="button"
                    className="check-lg"
                    aria-pressed={day.one.done}
                    aria-label={day.one.done ? 'Mark your ONE thing not done' : 'Mark your ONE thing done'}
                    onClick={toggleOne}
                  >
                    <Icon name="check" size={22} width={2.6} />
                  </button>
                  <p className={'one-text' + (day.one.done ? ' is-done' : '')}>{day.one.text}</p>
                </div>
                {goal && (
                  <p className="meta">
                    <Icon name="goals" size={16} />
                    <span>Helps: {goal.text}</span>
                  </p>
                )}
                {!day.one.done && (
                  <button type="button" className="btn btn-sm btn-primary indent" onClick={() => go('focusStart')}>
                    <Icon name="play" size={18} width={2} />
                    <span>Start focus</span>
                  </button>
                )}
              </>
            )}
          </section>

          <section className="stack" aria-label="Tasks" ref={tasksRef}>
            <div className="row-between">
              <h2>Tasks</h2>
              <span className="count">{day.tasks.length} of {MAX_TASKS}</span>
            </div>
            {day.tasks.map((t) =>
              taskEdit?.id === t.id ? (
                <form className="stack" style={{ gap: 8 }} key={t.id} data-flip={t.id} onSubmit={saveTaskEdit}>
                  <div className="inline-form">
                    <input className="field" id="task-edit" type="text" maxLength={120} aria-label="Edit task" autoFocus value={taskEdit.text} onChange={(e) => setTaskEdit({ id: t.id, text: e.target.value })} />
                    <button type="submit" className="btn btn-primary">Save</button>
                  </div>
                  <div className="btn-row">
                    <button type="button" className="btn btn-sm" onClick={deleteTask}>
                      <Icon name="trash" size={18} />
                      <span>Delete task</span>
                    </button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => setTaskEdit(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={'task' + (t.id === justAdded ? ' task-new' : '')} key={t.id} data-flip={t.id}>
                  <button
                    type="button"
                    className="check-sm"
                    aria-pressed={t.done}
                    aria-label={t.done ? 'Mark task not done' : 'Mark task done'}
                    onClick={(e) => toggleTask(t.id, e)}
                  >
                    <span className="dot"><Icon name="check" size={14} width={3} /></span>
                  </button>
                  <span className={'task-text' + (t.done ? ' is-done' : '')}>{t.text}</span>
                  <button type="button" className="task-edit" aria-label={'Edit task: ' + t.text} onClick={() => setTaskEdit({ id: t.id, text: t.text })}>
                    <Icon name="edit" size={18} />
                  </button>
                </div>
              ),
            )}
            {overflow ? (
              <div className="notice" role="status">
                <p><strong>Max 3 tasks.</strong> Send {'“'}{overflow}{'”'} to Idea parking instead?</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-sm btn-dark" onClick={overflowToIdeas}>Send to Ideas</button>
                  <button type="button" className="btn btn-sm" onClick={() => setOverflow('')}>Cancel</button>
                </div>
              </div>
            ) : adding ? (
              <div className="stack" style={{ gap: 6 }}>
                <label className="lbl" htmlFor="new-task">New task</label>
                <form className="inline-form" onSubmit={saveTask}>
                  <input className="field" id="new-task" type="text" maxLength={120} placeholder="A small, clear task" autoFocus value={newTask} onChange={(e) => setNewTask(e.target.value)} />
                  <button type="submit" className="btn btn-primary">Add</button>
                </form>
                <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="btn btn-dashed" data-flip="add" onClick={() => { setAdding(true); setOverflow(''); }}>
                <Icon name="plus" size={20} width={2} />
                <span>{left > 0 ? 'Add a task (' + left + ' left)' : 'Add a task (day is full)'}</span>
              </button>
            )}
          </section>
        </>
      ) : (
        <section className="card" aria-label="Pick your ONE thing">
          <div className="mascot-row">
            <p className="eyebrow">No plan for today</p>
            <Mascot mood="look" size={64} pad={8} />
          </div>
          <label className="lbl" htmlFor="quick-one">Pick your ONE thing now</label>
          <form className="inline-form" onSubmit={saveQuickOne}>
            <input className="field" id="quick-one" type="text" maxLength={140} placeholder="The one thing that matters today" value={quickOne} onChange={(e) => setQuickOne(e.target.value)} />
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </section>
      )}

      {pendingDecisions(data).map((p) => (
        <section className="soft" aria-label="Decision to finish" key={p.id}>
          <div className="stack" style={{ gap: 2 }}>
            <span className="soft-label">You slept on this</span>
            <span>{p.text}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--surface)', color: 'var(--accent-strong)', fontWeight: 700 }}
            onClick={() => openDecision(p.id)}
          >
            Finish
          </button>
        </section>
      ))}

      {!evening && !tomorrowPlanned && (
        <button type="button" className="link-quiet" onClick={() => go('plan')}>
          <Icon name="plan" size={18} />
          <span>Plan tomorrow tonight at {data.settings.planTime}</span>
        </button>
      )}
    </>
  );
}

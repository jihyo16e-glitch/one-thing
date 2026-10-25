import { useEffect, useRef, type FormEvent } from 'react';
import { useApp, type PlanState } from '../app/AppContext';
import type { AppData } from '../domain/types';
import { addDays, daysSince, fmtDay } from '../domain/dates';
import { MAX_TASKS, activeGoals, addIdea, backupDue, getDay, goalLabel, hasPlan, setPlan, todayKey, uid, type PlanDraft } from '../domain/rules';
import { Icon } from '../ui/Icon';

/** The draft starts from what is already saved for the target day. Target = tomorrow, or today if asked. */
function buildDraft(data: AppData, key: string): PlanDraft {
  const d = getDay(data, key);
  return {
    key,
    one: d ? d.one.text : '',
    goalId: d && d.one.goalId ? d.one.goalId : '',
    tasks: d ? d.tasks.map((t) => ({ id: t.id, text: t.text, done: t.done })) : [],
    food: d ? d.small.food : '',
    clothes: d ? d.small.clothes : '',
  };
}

function freshPlan(data: AppData, key: string, newTask = ''): PlanState {
  const draft = buildDraft(data, key);
  return { draft, base: draft, overflow: '', newTask };
}

function sameDraft(a: PlanDraft, b: PlanDraft): boolean {
  return (
    a.key === b.key && a.one === b.one && a.goalId === b.goalId && a.food === b.food && a.clothes === b.clothes &&
    a.tasks.length === b.tasks.length &&
    a.tasks.every((t, i) => t.id === b.tasks[i].id && t.text === b.tasks[i].text && t.done === b.tasks[i].done)
  );
}

function isUntouched(p: PlanState): boolean {
  return sameDraft(p.draft, p.base) && !p.overflow && !p.newTask.trim();
}

/**
 * The unsaved plan kept in AppContext, brought up to date with the saved data (a pure function,
 * so it is safe to run on every render). Nothing kept, or kept for a day that is no longer today
 * or tomorrow → a fresh draft for tomorrow. If the saved day changed elsewhere since the draft was
 * built (a tick on Today, "Move to tomorrow" in Ideas), that change is merged in, so Save never
 * undoes it. A typed task that no longer fits goes to the existing "Max 3 tasks" offer.
 */
function syncPlan(data: AppData, today: string, held: PlanState | null): PlanState {
  const tomorrow = addDays(today, 1);
  if (!held || (held.draft.key !== today && held.draft.key !== tomorrow)) return freshPlan(data, tomorrow);
  const saved = buildDraft(data, held.draft.key);
  const { draft: mine, base } = held;
  if (sameDraft(saved, base)) return held; // nothing changed elsewhere
  if (sameDraft(mine, base)) return { ...held, draft: saved, base: saved }; // nothing typed: take the saved day
  const pick = (m: string, b: string, s: string) => (m === b ? s : m); // the user's edit wins
  const savedById = new Map(saved.tasks.map((t) => [t.id, t]));
  const baseIds = new Set(base.tasks.map((t) => t.id));
  const mineIds = new Set(mine.tasks.map((t) => t.id));
  const merged = [
    ...mine.tasks.map((t) => ({ ...t, done: savedById.get(t.id)?.done ?? t.done })),
    ...saved.tasks.filter((t) => !baseIds.has(t.id) && !mineIds.has(t.id)), // added elsewhere
  ];
  let room = MAX_TASKS - merged.filter((t) => savedById.has(t.id)).length; // saved tasks always stay
  const tasks: PlanDraft['tasks'] = [];
  const out: string[] = [];
  for (const t of merged) {
    if (savedById.has(t.id)) tasks.push(t);
    else if (room > 0) { tasks.push(t); room--; }
    else if (t.text.trim()) out.push(t.text.trim());
  }
  return {
    draft: {
      key: mine.key,
      one: pick(mine.one, base.one, saved.one),
      goalId: pick(mine.goalId, base.goalId, saved.goalId),
      tasks,
      food: pick(mine.food, base.food, saved.food),
      clothes: pick(mine.clothes, base.clothes, saved.clothes),
    },
    base: saved,
    overflow: [held.overflow, ...out].filter(Boolean).join(', '),
    newTask: held.newTask,
  };
}

export function PlanScreen() {
  const { data, commit, go, toast, scrollTop, plan, setPlanState } = useApp();
  const today = todayKey(data);
  // The draft lives in AppContext (like the Decide wizard), so a tab switch does not lose it.
  const ps = syncPlan(data, today, plan);
  const { draft, overflow, newTask } = ps;
  const setDraft = (next: PlanDraft) => setPlanState({ ...ps, draft: next });
  const setOverflow = (text: string) => setPlanState({ ...ps, overflow: text });
  const setNewTask = (text: string) => setPlanState({ ...ps, newTask: text });
  const newTaskRef = useRef<HTMLInputElement>(null);
  const oneRef = useRef<HTMLInputElement>(null);

  // Leaving the tab: an untouched draft is dropped, so the next visit starts on tomorrow with
  // fresh saved data (as before). A draft with typed changes is kept for the next visit.
  const latest = useRef(ps);
  useEffect(() => {
    latest.current = ps;
  });
  useEffect(
    () => () => {
      if (isUntouched(latest.current)) setPlanState(null);
    },
    [setPlanState],
  );

  const isToday = draft.key === today;
  const saved = hasPlan(data, draft.key);
  const since = daysSince(data.settings.lastExportAt);

  function switchTarget() {
    setPlanState(freshPlan(data, isToday ? addDays(today, 1) : today, newTask));
    scrollTop();
  }

  function addToDraft(e: FormEvent) {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) { toast('Write the task first.'); return; }
    if (draft.tasks.length >= MAX_TASKS) { setPlanState({ ...ps, newTask: '', overflow: text }); return; } // the 4th task is refused
    setPlanState({ ...ps, newTask: '', draft: { ...draft, tasks: [...draft.tasks, { id: uid('t'), text, done: false }] } });
    newTaskRef.current?.focus();
  }

  function removeTask(id: string) {
    setDraft({ ...draft, tasks: draft.tasks.filter((t) => t.id !== id) });
  }

  function editTask(id: string, text: string) {
    setDraft({ ...draft, tasks: draft.tasks.map((t) => (t.id === id ? { ...t, text } : t)) });
  }

  function overflowToIdeas() {
    commit((d) => addIdea(d, overflow, 'overflow'));
    setOverflow('');
    toast('Parked in Ideas.');
  }

  function save() {
    if (!draft.one.trim()) {
      toast('Write your ONE thing first.');
      oneRef.current?.focus();
      return;
    }
    commit((d) => setPlan(d, draft.key, draft));
    // Owner feedback at the gate 8 check: after saving, go to Today. The held draft is cleared, so the
    // next visit to Plan starts from the saved data. Today shows "Tomorrow is planned".
    setPlanState(null);
    toast('Plan saved for ' + fmtDay(draft.key).split(',')[0] + '.');
    go('today');
  }

  return (
    <>
      <header className="head">
        <p className="sub">{fmtDay(draft.key)}</p>
        <h1>{isToday ? 'Plan today' : 'Plan tomorrow'}</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          {isToday ? 'Today has no plan yet. Pick your ONE thing now.' : 'Plan now, while your mind is fresh.'}
        </p>
      </header>

      {(isToday || !hasPlan(data, today)) && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={switchTarget}>
          {isToday ? 'Plan tomorrow instead' : 'Plan today instead'}
        </button>
      )}

      <section className="card" aria-label="Your ONE thing">
        <label className="eyebrow" htmlFor="plan-one">Your ONE thing</label>
        <input
          ref={oneRef}
          className="field field-lg"
          id="plan-one"
          type="text"
          maxLength={140}
          placeholder="What matters most?"
          value={draft.one}
          onChange={(e) => setDraft({ ...draft, one: e.target.value })}
        />
        <label className="lbl" htmlFor="plan-goal">Which goal does it help?</label>
        <select className="field" id="plan-goal" value={draft.goalId} onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}>
          <option value="">None</option>
          {activeGoals(data).map((g) => (
            <option key={g.id} value={g.id}>{goalLabel(g)}</option>
          ))}
        </select>
      </section>

      <section className="stack" aria-label="Tasks">
        <div className="row-between">
          <h2>Tasks</h2>
          <span className="count">{draft.tasks.length} of {MAX_TASKS}</span>
        </div>
        {draft.tasks.map((t, i) => (
          <div className="inline-form" key={t.id}>
            <input
              className="field"
              id={'plan-task-' + t.id}
              type="text"
              maxLength={120}
              aria-label={'Task ' + (i + 1)}
              value={t.text}
              onChange={(e) => editTask(t.id, e.target.value)}
            />
            <button type="button" className="btn btn-sm" aria-label={'Remove task ' + (i + 1)} onClick={() => removeTask(t.id)}>
              <Icon name="trash" size={20} />
            </button>
          </div>
        ))}
        {overflow ? (
          <div className="notice" role="status">
            <p><strong>Max 3 tasks.</strong> Send {'“'}{overflow}{'”'} to Ideas instead?</p>
            <div className="btn-row">
              <button type="button" className="btn btn-sm btn-dark" onClick={overflowToIdeas}>Send to Ideas</button>
              <button type="button" className="btn btn-sm" onClick={() => setOverflow('')}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <label className="lbl" htmlFor="plan-new-task">
              {draft.tasks.length < MAX_TASKS ? 'Add a task' : 'Add a task (the day is full)'}
            </label>
            <form className="inline-form" onSubmit={addToDraft}>
              <input
                ref={newTaskRef}
                className="field"
                id="plan-new-task"
                type="text"
                maxLength={120}
                placeholder="A small, clear task"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />
              <button type="submit" className="btn">Add</button>
            </form>
          </>
        )}
      </section>

      <section className="stack" aria-label="Small decisions">
        <h2>Small decisions <span className="count" style={{ fontWeight: 400 }}>(optional)</span></h2>
        <div className="btn-grid">
          <div className="stack" style={{ gap: 4 }}>
            <label className="lbl" htmlFor="plan-food">Food</label>
            <input className="field" id="plan-food" type="text" maxLength={80} placeholder="What to eat" value={draft.food} onChange={(e) => setDraft({ ...draft, food: e.target.value })} />
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <label className="lbl" htmlFor="plan-clothes">Clothes</label>
            <input className="field" id="plan-clothes" type="text" maxLength={80} placeholder="What to wear" value={draft.clothes} onChange={(e) => setDraft({ ...draft, clothes: e.target.value })} />
          </div>
        </div>
      </section>

      {backupDue(data) && (
        <div className="row-between" style={{ alignItems: 'center' }}>
          <span className="sub">{since === null ? 'No backup yet.' : 'Last backup: ' + since + ' days ago.'}</span>
          <button type="button" className="btn btn-sm btn-quiet" style={{ color: 'var(--accent-strong)', fontWeight: 700 }} onClick={() => go('goals')}>
            Back up now
          </button>
        </div>
      )}

      <button type="button" className="btn btn-primary btn-block" onClick={save}>{saved ? 'Update plan' : 'Save plan'}</button>
    </>
  );
}

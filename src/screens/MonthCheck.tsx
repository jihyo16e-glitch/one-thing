// The month-end check (2026-10-25, Law 1 of "learn anything fast": pull it out before you look).
// Step 1: write your goals from memory. Step 2: the real list; mark each goal and say what happened.
import { useState, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import { parseKey } from '../domain/dates';
import { activeGoals, goalMeta, saveCheck, todayKey, type CheckAnswer } from '../domain/rules';

const ACTIONS: { id: CheckAnswer['action']; label: string }[] = [
  { id: 'keep', label: 'Keep going' },
  { id: 'done', label: 'Done' },
  { id: 'move', label: 'Move' },
  { id: 'drop', label: 'Drop' },
];

export function monthName(month: string): string {
  return parseKey(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function MonthCheck({ month, onClose }: { month: string; onClose: () => void }) {
  const { data, commit, toast, scrollTop } = useApp();
  const today = todayKey(data);
  const goals = activeGoals(data);
  const [step, setStep] = useState<'recall' | 'review'>('recall');
  const [recalled, setRecalled] = useState('');
  const [answers, setAnswers] = useState<Record<string, CheckAnswer>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, { id: g.id, remembered: false, action: 'keep', date: '', note: '' }])),
  );

  function set(id: string, patch: Partial<CheckAnswer>) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  }

  function show(e: FormEvent) {
    e.preventDefault();
    if (!recalled.trim()) { toast('Write what you remember first. A guess is fine.'); return; }
    setStep('review');
    scrollTop();
  }

  function save() {
    const list = goals.map((g) => answers[g.id]).filter((a): a is CheckAnswer => !!a);
    if (list.some((a) => a.action === 'move' && !a.date)) { toast('Pick the new day for each goal you move.'); return; }
    const check = commit((d) => saveCheck(d, month, recalled, list, today));
    toast('Check saved. You remembered ' + check.remembered + ' of ' + check.total + ' goals.');
    onClose();
  }

  if (step === 'recall') {
    return (
      <section className="card card-hi" aria-label="Month check">
        <p className="eyebrow">Month check · {monthName(month)}</p>
        <h2>Write your goals from memory</h2>
        <p className="sub">Do not look yet. A goal you cannot remember is not alive.</p>
        <form className="stack" onSubmit={show}>
          <label className="lbl" htmlFor="check-recall">My goals, as I remember them</label>
          <textarea className="field" id="check-recall" rows={5} maxLength={1000} value={recalled} onChange={(e) => setRecalled(e.target.value)} />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">Show my goals</button>
            <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <>
      <section className="card" aria-label="What you remembered">
        <p className="eyebrow">Month check · {monthName(month)}</p>
        <h2>Now mark each goal</h2>
        <p className="sub" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>You wrote: {recalled}</p>
      </section>

      {goals.length ? goals.map((g) => {
        const a = answers[g.id];
        if (!a) return null;
        const meta = goalMeta(g, today);
        return (
          <section className="card" style={{ padding: 16, gap: 10 }} aria-label={'Goal: ' + g.text} key={g.id}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="goal-title">{g.text}</span>
              {meta && <span className="count">{meta}</span>}
            </div>
            <label className="check-row">
              <input type="checkbox" checked={a.remembered} onChange={(e) => set(g.id, { remembered: e.target.checked })} />
              <span>I remembered it</span>
            </label>
            <div className="btn-row" role="group" aria-label={'What happened: ' + g.text}>
              {ACTIONS.map((x) => (
                <button
                  type="button"
                  key={x.id}
                  className={'btn chip' + (a.action === x.id ? ' btn-chosen' : '')}
                  aria-pressed={a.action === x.id}
                  onClick={() => set(g.id, { action: x.id, date: x.id === 'done' ? today : x.id === 'move' ? '' : a.date })}
                >
                  {x.label}
                </button>
              ))}
            </div>
            {a.action === 'done' && (
              <div className="stack" style={{ gap: 4 }}>
                <label className="lbl" htmlFor={'check-date-' + g.id}>Done on</label>
                <input className="field" type="date" id={'check-date-' + g.id} max={today} value={a.date} onChange={(e) => set(g.id, { date: e.target.value })} />
              </div>
            )}
            {a.action === 'move' && (
              <div className="stack" style={{ gap: 4 }}>
                <label className="lbl" htmlFor={'check-date-' + g.id}>New planned day</label>
                <input className="field" type="date" id={'check-date-' + g.id} min={today} value={a.date} onChange={(e) => set(g.id, { date: e.target.value })} />
              </div>
            )}
            {a.action !== 'keep' && (
              <div className="stack" style={{ gap: 4 }}>
                <label className="lbl" htmlFor={'check-note-' + g.id}>Why? One line (optional)</label>
                <input className="field" type="text" id={'check-note-' + g.id} maxLength={120} value={a.note} onChange={(e) => set(g.id, { note: e.target.value })} />
              </div>
            )}
          </section>
        );
      }) : <p className="placeholder">No active goals to check.</p>}

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={save}>Save check</button>
        <button type="button" className="btn btn-quiet" onClick={() => setStep('recall')}>Back</button>
      </div>
    </>
  );
}

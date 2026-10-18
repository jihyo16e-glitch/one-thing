import { useState, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import { addDays, fmtDate, ymd } from '../domain/dates';
import { MAX_TASKS, addIdea, getDay, moveIdeaToDay, removeIdea, todayKey } from '../domain/rules';
import { Header } from '../ui/Header';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';

export function IdeasScreen() {
  const { data, commit, toast } = useApp();
  const [newIdea, setNewIdea] = useState('');

  const tKey = addDays(todayKey(data), 1);
  const tDay = getDay(data, tKey);
  const full = !!(tDay && tDay.tasks.length >= MAX_TASKS);

  function park(e: FormEvent) {
    e.preventDefault();
    const text = newIdea.trim();
    if (!text) { toast('Write the idea first.'); return; }
    commit((d) => addIdea(d, text, 'idea'));
    setNewIdea('');
    toast('Parked. You can let it go now.');
  }

  function move(id: string) {
    const count = commit((d) => (moveIdeaToDay(d, id, tKey) ? getDay(d, tKey)?.tasks.length ?? 0 : -1));
    toast(count >= 0 ? 'Moved to tomorrow (' + count + ' of 3).' : 'Tomorrow is full. Remove a task first.');
  }

  function remove(id: string) {
    commit((d) => removeIdea(d, id));
    toast('Idea deleted.');
  }

  return (
    <>
      <Header sub="Not today. Safe here." title="Ideas" />

      <section className="stack" style={{ gap: 6 }} aria-label="Park a new idea">
        <label className="lbl" htmlFor="idea-new">New idea</label>
        <form className="inline-form" onSubmit={park}>
          <input className="field" id="idea-new" type="text" maxLength={140} placeholder="Write it down, then let it go" value={newIdea} onChange={(e) => setNewIdea(e.target.value)} />
          <button type="submit" className="btn btn-primary">Park it</button>
        </form>
      </section>

      {full && (
        <p className="notice" role="status" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Icon name="info" size={18} />
          <span>Tomorrow is full (3 of 3 tasks). To move an idea, first remove a task in Plan.</span>
        </p>
      )}

      <section className="stack" aria-label="Parked ideas">
        <div className="row-between">
          <h2>Parked</h2>
          <span className="count">{data.ideas.length + (data.ideas.length === 1 ? ' idea' : ' ideas')}</span>
        </div>
        {data.ideas.length === 0 && (
          <div className="mascot-row" style={{ justifyContent: 'flex-start' }}>
            <Mascot mood="idle" size={56} pad={10} />
            <p className="placeholder" style={{ margin: 0 }}>Nothing parked. When a new idea comes, write it here instead of starting it.</p>
          </div>
        )}
        {data.ideas.map((it) => (
          <article className="log-item" key={it.id}>
            <div className="row-between" style={{ alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <p style={{ fontSize: 17, overflowWrap: 'anywhere' }}>{it.text}</p>
                <p className="count">{(it.source === 'overflow' ? 'From a full day' : 'Idea') + ' · ' + fmtDate(ymd(new Date(it.createdAt)))}</p>
              </div>
              <button type="button" className="btn btn-sm btn-quiet icon-btn" aria-label="Delete idea" onClick={() => remove(it.id)}>
                <Icon name="trash" size={20} />
              </button>
            </div>
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} disabled={full} onClick={() => move(it.id)}>Move to tomorrow</button>
          </article>
        ))}
      </section>
    </>
  );
}

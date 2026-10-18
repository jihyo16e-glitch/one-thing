import { useState, type ReactNode } from 'react';
import { useApp } from '../app/AppContext';
import type { Decision, DecisionStep } from '../domain/types';
import { fmtDate, ymd } from '../domain/dates';
import { activeGoals, addIdea, getDecision, getGoal, goalLabel, newDecision, pendingDecisions, saveDecision } from '../domain/rules';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';

// The 7 fixed steps, written in our own plain words (brief §7.3). No AI.
const TYPE1_STEPS: DecisionStep[] = ['feeling', 'tenten', 'regret', 'goals', 'identity', 'decision', 'action'];
const STEP_TITLES: Partial<Record<DecisionStep, string>> = {
  feeling: 'Feeling', tenten: '10 · 10 · 10', regret: 'Regret', goals: 'Goals',
  identity: 'Who you want to be', decision: 'Decision', action: 'First action',
};
const FEELINGS: [string, string][] = [
  ['fear', 'Fear'], ['excitement', 'Excitement'], ['guilt', 'Guilt'], ['pressure', 'Pressure'],
  ['envy', 'Envy'], ['ego', 'Ego'], ['other', 'Other'],
];

function feelingLabel(v: string | null | undefined): string {
  return FEELINGS.find((f) => f[0] === v)?.[1] ?? '';
}

function Chosen({ chosen, extra, onClick, children }: { chosen: boolean; extra?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={'btn ' + (extra ?? '') + (chosen ? ' btn-chosen' : '')} aria-pressed={chosen} onClick={onClick}>
      {children}
    </button>
  );
}

function TextField(props: { id: string; label: string; value: string; placeholder: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="lbl" htmlFor={props.id}>{props.label}</label>
      <input className="field" id={props.id} type="text" maxLength={160} value={props.value} placeholder={props.placeholder} autoFocus={props.autoFocus} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function AreaField(props: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="lbl" htmlFor={props.id}>{props.label}</label>
      <textarea className="field" id={props.id} maxLength={300} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

function ProgressBar({ step }: { step: DecisionStep }) {
  const i = TYPE1_STEPS.indexOf(step);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <p className="sub"><strong style={{ color: 'var(--accent)' }}>Step {i + 1} of 7</strong> · {STEP_TITLES[step]}</p>
      <div className="progress" aria-hidden="true">
        {TYPE1_STEPS.map((s, j) => <span key={s} className={j <= i ? 'on' : undefined} />)}
      </div>
    </div>
  );
}

function NavRow({ nextEnabled, onBack, onNext }: { nextEnabled: boolean; onBack: () => void; onNext: () => void }) {
  return (
    <div className="btn-grid">
      <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={onBack}>Back</button>
      <button type="button" className="btn btn-primary btn-block" style={{ fontSize: 17 }} disabled={!nextEnabled} onClick={onNext}>Next</button>
    </div>
  );
}

function Recap({ d, goalName }: { d: Decision; goalName: string }) {
  const rows: [string, string][] = [];
  if (d.feeling) rows.push(['Feeling', feelingLabel(d.feeling) + (d.trustFeeling === false ? ' (not fully trusted)' : '')]);
  if (d.t10y) rows.push(['In 10 years', d.t10y]);
  if (d.regretOk !== null && d.regretOk !== undefined) rows.push(['If it fails', d.regretOk ? 'I still respect who I became' : 'I would not respect myself']);
  if (d.goalId) rows.push(['Goal', d.goalId === 'none' ? 'None' : goalName]);
  if (d.fitsIdentity !== null && d.fitsIdentity !== undefined) rows.push(['Fits who I want to be', d.fitsIdentity ? 'Yes' : 'No']);
  if (!rows.length) return null;
  return (
    <dl className="recap">
      {rows.map((r) => (
        <div key={r[0]}><dt>{r[0]}</dt><dd>{r[1]}</dd></div>
      ))}
    </dl>
  );
}

export function DecideScreen() {
  const { data, commit, toast, scrollTop, decide, setDecide, openDecision } = useApp();
  const [newText, setNewText] = useState('');

  function toHome() { setDecide({ view: 'home', dec: null, savedId: null }); scrollTop(); }
  function toLog() { setDecide({ ...decide, view: 'log' }); scrollTop(); }

  function start() {
    const text = newText.trim();
    if (!text) { toast('Write what you need to decide.'); return; }
    setNewText('');
    setDecide({ view: 'wizard', dec: newDecision(text), savedId: null });
    scrollTop();
  }

  /* ---------- home ---------- */
  if (decide.view === 'home' || (decide.view === 'wizard' && !decide.dec)) {
    const logCount = data.decisions.filter((d) => d.status !== 'draft').length;
    const pending = pendingDecisions(data);
    return (
      <>
        <header className="head-row">
          <div className="head">
            <p className="sub">Turn a stuck decision into one action</p>
            <h1>Decide</h1>
          </div>
          <button type="button" className="btn btn-sm" onClick={toLog}>
            <Icon name="list" size={18} />
            <span>Log ({logCount})</span>
          </button>
        </header>
        <section className="card" aria-label="New decision">
          <div className="mascot-row">
            <label className="eyebrow" htmlFor="dec-text">New decision</label>
            <Mascot mood="think" size={56} pad={16} />
          </div>
          <input className="field field-lg" id="dec-text" type="text" maxLength={140} placeholder="What do you need to decide?" value={newText} onChange={(e) => setNewText(e.target.value)} />
          <button type="button" className="btn btn-primary btn-block" onClick={start}>Start</button>
          <p className="sub">The first question is: if you choose wrong, can you fix it later?</p>
        </section>
        {pending.length > 0 && (
          <section className="stack" aria-label="Sleeping on these">
            <h2>You are sleeping on these</h2>
            {pending.map((p) => (
              <div className="soft" key={p.id}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.text}</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ background: 'var(--surface)', borderColor: 'var(--surface)', color: 'var(--accent-strong)', fontWeight: 700, flex: 'none' }}
                  onClick={() => openDecision(p.id)}
                >
                  Finish
                </button>
              </div>
            ))}
          </section>
        )}
      </>
    );
  }

  /* ---------- saved ---------- */
  if (decide.view === 'saved') {
    const d = decide.savedId ? getDecision(data, decide.savedId) : null;
    if (!d) return null;
    const toggleAction = () => {
      const doneNow = commit((draft) => {
        const r = getDecision(draft, d.id);
        if (!r) return false;
        r.actionDone = !r.actionDone;
        return r.actionDone;
      });
      if (doneNow) toast('Action done. That is progress.');
    };
    return (
      <>
        <header className="head"><p className="sub">{d.text}</p><h1>Decided</h1></header>
        <section className="card" aria-label="Your decision">
          <p className="eyebrow">Your decision</p>
          <p className="one-text" style={{ fontSize: 21 }}>{d.choice}</p>
        </section>
        {d.firstAction && (
          <section className="stack" aria-label="First action">
            <h2>First action (next 5 minutes)</h2>
            <div className="task">
              <button type="button" className="check-sm" aria-pressed={d.actionDone} aria-label={d.actionDone ? 'Mark action not done' : 'Mark action done'} onClick={toggleAction}>
                <span className="dot"><Icon name="check" size={14} width={3} /></span>
              </button>
              <span className={'task-text' + (d.actionDone ? ' is-done' : '')}>{d.firstAction}</span>
            </div>
          </section>
        )}
        <div className="btn-grid">
          <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={toHome}>New decision</button>
          <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={toLog}>Open log</button>
        </div>
      </>
    );
  }

  /* ---------- log ---------- */
  if (decide.view === 'log') {
    const list = data.decisions
      .filter((d) => d.status !== 'draft')
      .slice()
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return (
      <>
        <div className="row-between" style={{ alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-quiet" onClick={toHome}>
            <Icon name="back" size={20} width={2} />
            <span>Decide</span>
          </button>
        </div>
        <header className="head"><p className="sub">Every decision, newest first</p><h1>Decision log</h1></header>
        {list.length === 0 && <p className="placeholder">No decisions yet. Start one on the Decide screen.</p>}
        {list.map((d) => (
          <article className="log-item" key={d.id}>
            <div className="btn-row" style={{ gap: 6 }}>
              <span className={'badge' + (d.type === 1 ? ' badge-accent' : '')}>{d.type === 1 ? 'Type 1 · think it through' : 'Type 2 · decide fast'}</span>
              <span className="badge">{d.status === 'pending' ? 'Sleeping on it' : 'Decided'}</span>
            </div>
            <p style={{ fontWeight: 700, fontSize: 17, overflowWrap: 'anywhere' }}>{d.text}</p>
            {d.choice && <p className="sub" style={{ color: 'var(--ink)' }}>Choice: {d.choice}</p>}
            {d.firstAction && <p className="sub">First action: {d.firstAction}{d.actionDone ? ' — done' : ''}</p>}
            <p className="count">{d.createdAt ? fmtDate(ymd(new Date(d.createdAt))) : ''}</p>
          </article>
        ))}
      </>
    );
  }

  /* ---------- wizard ---------- */
  const d = decide.dec as Decision;
  const patch = (p: Partial<Decision>) => setDecide({ ...decide, dec: { ...d, ...p } });
  const goalName = d.goalId && d.goalId !== 'none' ? getGoal(data, d.goalId)?.text ?? '' : '';

  const next = () => {
    if (d.step === 'decision' && !d.choice.trim()) { toast('Write your decision, or tap Sleep on it.'); return; }
    const i = TYPE1_STEPS.indexOf(d.step);
    if (i >= 0 && i < TYPE1_STEPS.length - 1) { patch({ step: TYPE1_STEPS[i + 1] }); scrollTop(); }
  };
  const back = () => {
    if (d.step === 'choice2' || d.step === 'feeling') patch({ step: 'type', type: null });
    else {
      const i = TYPE1_STEPS.indexOf(d.step);
      if (i > 0) patch({ step: TYPE1_STEPS[i - 1] });
    }
    scrollTop();
  };
  const sleep = () => {
    commit((draft) => saveDecision(draft, { ...d, status: 'pending', step: 'decision' }));
    toHome();
    toast('Saved. You will see it again on Today.');
  };
  const park = () => {
    commit((draft) => {
      addIdea(draft, d.text, 'idea');
      saveDecision(draft, { ...d, status: 'decided', step: 'done', choice: 'Parked in Ideas for later.', firstAction: '', decidedAt: new Date().toISOString() });
    });
    setDecide({ view: 'saved', dec: null, savedId: d.id });
    scrollTop();
    toast('Parked in Ideas.');
  };
  const save = () => {
    if (!d.choice.trim()) { toast('Write what you choose.'); return; }
    if (!d.firstAction.trim()) { toast('Write one small action for the next 5 minutes.'); return; }
    commit((draft) =>
      saveDecision(draft, { ...d, choice: d.choice.trim(), firstAction: d.firstAction.trim(), status: 'decided', step: 'done', decidedAt: new Date().toISOString() }),
    );
    setDecide({ view: 'saved', dec: null, savedId: d.id });
    scrollTop();
    toast('Decision saved.');
  };

  let body: ReactNode = null;
  switch (d.step) {
    case 'choice2':
      body = (
        <section className="stack-lg" aria-label="Decide fast">
          <p className="q">Decide now. You can fix it later.</p>
          <TextField id="dec-choice" label="What do you choose?" value={d.choice} placeholder="Your choice in one line" autoFocus onChange={(v) => patch({ choice: v })} />
          <TextField id="dec-action" label="One action for the next 5 minutes" value={d.firstAction} placeholder={'Send the message, book the time…'} onChange={(v) => patch({ firstAction: v })} />
          <button type="button" className="btn btn-primary btn-block" onClick={save}>Save decision</button>
        </section>
      );
      break;
    case 'feeling':
      body = (
        <>
          <ProgressBar step="feeling" />
          <section className="stack-lg" aria-label="Your feeling">
            <p className="q">What do you feel most when you think about it?</p>
            <div className="btn-row">
              {FEELINGS.map((f) => (
                <Chosen key={f[0]} chosen={d.feeling === f[0]} extra="chip" onClick={() => patch({ feeling: f[0] })}>{f[1]}</Chosen>
              ))}
            </div>
            <p className="q">Can you trust this feeling right now?</p>
            <div className="btn-grid">
              <Chosen chosen={d.trustFeeling === true} onClick={() => patch({ trustFeeling: true })}>Yes</Chosen>
              <Chosen chosen={d.trustFeeling === false} onClick={() => patch({ trustFeeling: false })}>No, not fully</Chosen>
            </div>
            <p className="sub">A feeling is real. But it can be bigger than the real risk. Name it first, then think.</p>
          </section>
          <NavRow nextEnabled={!!d.feeling && d.trustFeeling !== null && d.trustFeeling !== undefined} onBack={back} onNext={next} />
        </>
      );
      break;
    case 'tenten':
      body = (
        <>
          <ProgressBar step="tenten" />
          <section className="stack-lg" aria-label="10, 10, 10">
            <p className="q">{'How will you feel about this choice in…'}</p>
            <AreaField id="dec-t10m" label="10 minutes" value={d.t10m ?? ''} onChange={(v) => patch({ t10m: v })} />
            <AreaField id="dec-t10mo" label="10 months" value={d.t10mo ?? ''} onChange={(v) => patch({ t10mo: v })} />
            <AreaField id="dec-t10y" label="10 years" value={d.t10y ?? ''} onChange={(v) => patch({ t10y: v })} />
            <p className="sub">Short answers are fine. Looking far ahead makes small fears smaller.</p>
          </section>
          <NavRow nextEnabled onBack={back} onNext={next} />
        </>
      );
      break;
    case 'regret':
      body = (
        <>
          <ProgressBar step="regret" />
          <section className="stack-lg" aria-label="Regret">
            <p className="q">If this fails, will you still respect who you became?</p>
            <div className="btn-grid">
              <Chosen chosen={d.regretOk === true} onClick={() => patch({ regretOk: true })}>Yes</Chosen>
              <Chosen chosen={d.regretOk === false} onClick={() => patch({ regretOk: false })}>No</Chosen>
            </div>
            <p className="sub">Judge yourself by who you became, not only by the result.</p>
          </section>
          <NavRow nextEnabled={d.regretOk !== null && d.regretOk !== undefined} onBack={back} onNext={next} />
        </>
      );
      break;
    case 'goals':
      body = (
        <>
          <ProgressBar step="goals" />
          <section className="stack-lg" aria-label="Goals">
            <p className="q">Which goal does this help?</p>
            <div className="stack">
              {activeGoals(data).map((g) => (
                <Chosen key={g.id} chosen={d.goalId === g.id} extra="btn-left" onClick={() => patch({ goalId: g.id })}>{goalLabel(g)}</Chosen>
              ))}
              <Chosen chosen={d.goalId === 'none'} extra="btn-left" onClick={() => patch({ goalId: 'none' })}>None of my goals</Chosen>
            </div>
            {d.goalId === 'none' && (
              <div className="notice" role="status">
                <p>This does not help a goal right now. Park it as an idea, so it waits without taking your day?</p>
                <div className="btn-row">
                  <button type="button" className="btn btn-sm btn-dark" onClick={park}>Park it in Ideas</button>
                </div>
              </div>
            )}
          </section>
          <NavRow nextEnabled={!!d.goalId} onBack={back} onNext={next} />
        </>
      );
      break;
    case 'identity':
      body = (
        <>
          <ProgressBar step="identity" />
          <section className="stack-lg" aria-label="Who you want to be">
            <p className="q">Does this choice fit the person you want to become?</p>
            <div className="btn-grid">
              <Chosen chosen={d.fitsIdentity === true} onClick={() => patch({ fitsIdentity: true })}>Yes</Chosen>
              <Chosen chosen={d.fitsIdentity === false} onClick={() => patch({ fitsIdentity: false })}>No</Chosen>
            </div>
            <p className="sub">Think of yourself one year from now. Would that person make this choice?</p>
          </section>
          <NavRow nextEnabled={d.fitsIdentity !== null && d.fitsIdentity !== undefined} onBack={back} onNext={next} />
        </>
      );
      break;
    case 'decision':
      body = (
        <>
          <ProgressBar step="decision" />
          <section className="stack-lg" aria-label="Decision">
            <p className="q">What do you decide?</p>
            <Recap d={d} goalName={goalName} />
            <TextField id="dec-choice" label="Your decision" value={d.choice} placeholder="Write your choice in one line" onChange={(v) => patch({ choice: v })} />
            <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={sleep}>
              <Icon name="plan" size={20} />
              <span>Sleep on it</span>
            </button>
            <p className="sub">Not sure yet? Sleep on it. You will see it again on Today.</p>
          </section>
          <NavRow nextEnabled onBack={back} onNext={next} />
        </>
      );
      break;
    case 'action':
      body = (
        <>
          <ProgressBar step="action" />
          <section className="stack-lg" aria-label="First action">
            <p className="q">One action for the next 5 minutes</p>
            <p className="sub">One small action now turns worry into progress.</p>
            <TextField id="dec-action" label="First action" value={d.firstAction} placeholder={'Send the message, book the time…'} onChange={(v) => patch({ firstAction: v })} />
          </section>
          <div className="btn-grid">
            <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={back}>Back</button>
            <button type="button" className="btn btn-primary btn-block" style={{ fontSize: 17 }} onClick={save}>Save</button>
          </div>
        </>
      );
      break;
    default:
      body = (
        <section className="stack-lg" aria-label="Can you fix it later">
          <p className="q">If you choose wrong, can you fix it later?</p>
          <p className="sub">Most choices can be fixed later. Decide those fast. Only the hard-to-undo ones need slow thinking.</p>
          <div className="stack">
            <Chosen chosen={false} extra="btn-block" onClick={() => { patch({ type: 2, step: 'choice2' }); scrollTop(); }}>Yes, I can fix it later</Chosen>
            <Chosen chosen={false} extra="btn-block" onClick={() => { patch({ type: 1, step: 'feeling' }); scrollTop(); }}>No, it is hard to undo</Chosen>
          </div>
        </section>
      );
  }

  return (
    <>
      <div className="row-between" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-sm btn-quiet" onClick={toHome}>
          <Icon name="back" size={20} width={2} />
          <span>Decide</span>
        </button>
        {d.type ? <span className="badge badge-accent">Type {d.type}</span> : null}
      </div>
      <section className="card" style={{ gap: 6, padding: 16 }} aria-label="Your decision">
        <p className="one-text" style={{ fontSize: 19 }}>{d.text}</p>
        {d.type ? (
          <p className="sub">
            Can you fix it later? <strong style={{ color: 'var(--ink)' }}>{d.type === 2 ? 'Yes' : 'No'}</strong> {'→'} {d.type === 2 ? 'Type 2: decide fast.' : 'Type 1: take your time.'}
          </p>
        ) : null}
      </section>
      {body}
    </>
  );
}

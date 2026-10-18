import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { finishWelcome } from '../domain/rules';
import { Header } from '../ui/Header';
import { Mascot } from '../ui/Mascot';

const STEPS = 3;
const GOAL_HINTS = ['For example: Get a better job', 'For example: Save money every month', 'Optional'];

/** First open on a new phone: what the app is for → your goals → your plan time. No tab bar. */
export function WelcomeScreen() {
  const { data, commit, toast, scrollTop, slide, go } = useApp();
  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState(['', '', '']);
  const [planTime, setPlanTime] = useState(data.settings.planTime);

  function to(next: number) {
    slide(() => setStep(next), next > step ? 'forward' : 'back');
    scrollTop();
  }

  function skip() {
    commit((d) => { d.settings.welcomeDone = true; });
    go('today'); // Today's cards rise in
  }

  function start() {
    commit((d) => finishWelcome(d, goals, planTime));
    go('today');
    toast('Ready. Pick your ONE thing for today.');
  }

  const progress = (
    <div className="progress" style={{ gridTemplateColumns: 'repeat(' + STEPS + ', minmax(0, 1fr))' }} aria-hidden="true">
      {Array.from({ length: STEPS }, (_, i) => <span key={i} className={i < step ? 'on' : undefined} />)}
    </div>
  );

  if (step === 1) {
    return (
      <>
        <Header sub={'Step 1 of ' + STEPS} title="One Thing" />
        {progress}
        <div className="welcome-mark"><Mascot mood="wave" size={132} pad={12} label="The One Thing seed waves hello" /></div>
        <section className="card" aria-label="What this app does">
          <p className="q">Too many goals? Pick ONE thing a day.</p>
          <ol className="welcome-steps">
            <li><strong>Tonight:</strong> plan tomorrow. Your ONE thing, plus at most 3 small tasks.</li>
            <li><strong>Tomorrow:</strong> do your ONE thing first.</li>
            <li><strong>Any time:</strong> park new ideas, and decide when you are stuck.</li>
          </ol>
        </section>
        <p className="sub">No account. Your data stays on this phone.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => to(2)}>Next</button>
        <button type="button" className="link-quiet" onClick={skip}>Skip</button>
      </>
    );
  }

  if (step === 2) {
    return (
      <>
        <Header sub={'Step 2 of ' + STEPS} title="Your goals" />
        {progress}
        <p className="sub">What matters most in the next 90 days? Write up to 3. You can change them later in Goals.</p>
        <section className="stack" aria-label="Your goals">
          {goals.map((g, i) => (
            <div className="stack" style={{ gap: 4 }} key={i}>
              <label className="lbl" htmlFor={'welcome-goal-' + (i + 1)}>Goal {i + 1}</label>
              <input
                className="field"
                id={'welcome-goal-' + (i + 1)}
                type="text"
                maxLength={120}
                placeholder={GOAL_HINTS[i]}
                value={g}
                onChange={(e) => setGoals(goals.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
        </section>
        <div className="btn-grid">
          <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={() => to(1)}>Back</button>
          <button type="button" className="btn btn-primary btn-block" style={{ fontSize: 17 }} onClick={() => to(3)}>Next</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Header sub={'Step 3 of ' + STEPS} title="Your plan time" />
      {progress}
      <p className="sub">Every evening, you plan tomorrow. When?</p>
      <section className="stack" style={{ gap: 4 }} aria-label="Plan time">
        <label className="lbl" htmlFor="welcome-plan">Night plan time</label>
        <input className="field" id="welcome-plan" type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} />
      </section>
      <section className="card" aria-label="Reminder">
        <p style={{ margin: 0 }}>The app does not send reminders. Set a daily alarm on your phone for this time.</p>
      </section>
      <div className="btn-grid">
        <button type="button" className="btn btn-block" style={{ fontSize: 17 }} onClick={() => to(2)}>Back</button>
        <button type="button" className="btn btn-primary btn-block" style={{ fontSize: 17 }} onClick={start}>Start</button>
      </div>
    </>
  );
}

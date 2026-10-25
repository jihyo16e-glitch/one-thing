// First open in the APK (2026-10-25, Gilles's first phone test: "I open TikTok, I see nothing"): the bubble was off and
// its switch hidden in Phone time. This screen asks once: turn the scroll bubble on, or skip. One button walks the
// user through the two phone switches in order, then turns the bubble on. It comes back only if never answered.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { openOverlaySettings, openUsageSettings } from '../app/focusLock';
import { phoneAccess, startBubble, type PhoneAccess } from '../app/screenTime';
import { Mascot } from '../ui/Mascot';
import { bubbleConfig } from './PhoneScreen';

export function BubbleSetup() {
  const { data, commit, toast } = useApp();
  const [access, setAccess] = useState<PhoneAccess | null>(null);
  const [busy, setBusy] = useState(false);

  // Checked now and each time the user comes back from the phone settings.
  const check = useCallback(() => { phoneAccess().then(setAccess); }, []);
  useEffect(() => {
    check();
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [check]);

  function skip() {
    commit((d) => { d.settings.phone.bubbleAsked = true; });
    toast('Skipped. Turn it on any time: Today, Phone time.');
  }

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    const ok = await startBubble(bubbleConfig(data));
    setBusy(false);
    if (!ok) {
      toast('It did not start. Check the 2 switches again.');
      check();
      return;
    }
    commit((d) => {
      d.settings.phone.bubble = true;
      d.settings.phone.bubbleAsked = true;
    });
    toast('Bubble on. Open TikTok or YouTube to see it.');
  }

  const step = !access ? null : !access.usage ? 'usage' : !access.overlay ? 'overlay' : 'ready';
  const done = (on: boolean | undefined) =>
    on ? <span className="badge badge-accent">On</span> : <span className="badge">Off</span>;

  return (
    <>
      <header className="head">
        <p className="sub">One more step</p>
        <h1>Stop doom scrolling</h1>
      </header>

      <section className="card card-hi" aria-label="Scroll bubble setup">
        <div className="mascot-row">
          <p className="eyebrow">Scroll bubble</p>
          <Mascot mood="wave" size={64} pad={16} />
        </div>
        <p style={{ margin: 0 }}>
          A small bubble shows your scrolling minutes on top of TikTok, YouTube, Facebook and Instagram. At your daily limit
          ({data.settings.phone.limitMin} minutes), it pauses the app and shows your ONE thing.
        </p>
        <div className="stack" style={{ gap: 4 }}>
          <div className="lock-switch"><span>1. Usage access</span>{done(access?.usage)}</div>
          <div className="lock-switch"><span>2. Display over other apps</span>{done(access?.overlay)}</div>
          <div className="lock-switch"><span>3. Turn the bubble on</span>{done(false)}</div>
        </div>
        {step === 'usage' && (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={openUsageSettings}>Allow Usage access</button>
            <p className="sub">Find One Thing in the list, switch it on, then come back here.</p>
          </>
        )}
        {step === 'overlay' && (
          <>
            <button type="button" className="btn btn-primary btn-block" onClick={openOverlaySettings}>Allow Display over other apps</button>
            <p className="sub">Find One Thing in the list, switch it on, then come back here.</p>
          </>
        )}
        {step === 'ready' && (
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={turnOn}>Turn on the bubble</button>
        )}
        <p className="sub">Your data stays on this phone. One Thing sees app names and minutes only, never what you do inside them.</p>
      </section>

      <button type="button" className="link-quiet" onClick={skip}>Skip for now</button>
    </>
  );
}

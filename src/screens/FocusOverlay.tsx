import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { exitFullscreen, releaseWake, requestWake } from '../app/focusDevice';
import { stopLock } from '../app/focusLock';
import { fmtClock } from '../domain/dates';
import { getDay, todayKey } from '../domain/rules';
import { Icon } from '../ui/Icon';
import { Mascot } from '../ui/Mascot';

/** Only the clock re-renders each second, so a GIF keeps playing smoothly. */
function Clock({ endsAt, onTimeUp }: { endsAt: number; onTimeUp: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt) onTimeUp();
    }, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, onTimeUp]);
  return <p className="focus-time" id="focus-time" aria-live="off">{fmtClock(endsAt - now)}</p>;
}

export function FocusOverlay() {
  const { data, commit, focus, setFocus, picture, go, toast, cheer } = useApp();
  const boxRef = useRef<HTMLDivElement>(null);
  const running = !!focus && !focus.timeUp;

  // Move keyboard focus into the overlay when it opens.
  useEffect(() => {
    if (focus) boxRef.current?.querySelector('button')?.focus();
  }, [focus?.endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The screen lock is dropped when the app is hidden; ask again when it comes back (and after a restart).
  useEffect(() => {
    if (!running || !data.settings.focus.keepAwake) return;
    requestWake();
    const onVisible = () => { if (document.visibilityState === 'visible') requestWake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [running, data.settings.focus.keepAwake]);

  const timeUp = useCallback(() => {
    if (focus && !focus.timeUp) {
      stopLock(); // the time is over: the phone is free again
      setFocus({ ...focus, timeUp: true, asking: false });
    }
  }, [focus, setFocus]);

  if (!focus) return null;

  const day = getDay(data, todayKey(data));

  function end() {
    stopLock();
    releaseWake();
    exitFullscreen();
    setFocus(null);
  }
  function finish() {
    commit((d) => {
      const x = getDay(d, todayKey(d));
      if (x) { x.one.done = true; x.one.doneAt = new Date().toISOString(); }
    });
    end();
    go('today');
    cheer();
    toast('ONE thing done. Well done.');
  }
  function stop() {
    end();
    go('today');
    toast('Focus stopped. You can start again any time.');
  }

  return (
    <div className="overlay" id="overlay" role="dialog" aria-modal="true" aria-label="Focus mode">
      <div className="overlay-inner" ref={boxRef}>
        <p className="focus-top">
          <Icon name="lock" size={16} />
          <span>Focus mode · {focus.minutes} minutes</span>
        </p>
        <div className="focus-pic">
          {picture ? (
            <img src={picture.url} alt="Your focus picture" />
          ) : (
            <Mascot mood="focus" size={240} pad={28} label="The seed breathes slowly: in for 4 seconds, out for 4 seconds. Breathe with it." />
          )}
        </div>
        <p className="eyebrow" style={{ marginTop: 32, color: 'var(--focus-accent)' }}>Your ONE thing</p>
        <p className="focus-one">{day ? day.one.text : ''}</p>
        {focus.timeUp ? (
          <>
            <p className="focus-time">00:00</p>
            <p className="focus-sub">Time is up. Did you finish your ONE thing?</p>
          </>
        ) : (
          <>
            <Clock endsAt={focus.endsAt} onTimeUp={timeUp} />
            {/* one text node, like gate 4: split text nodes shift glyphs by a fraction of a pixel */}
            <p className="focus-sub">{'left of ' + focus.minutes + ' minutes'}</p>
          </>
        )}
        <div className="focus-spacer" />
        {focus.asking ? (
          <div className="focus-box" role="alertdialog" aria-label="Stop focus?">
            <p>Stop now? Your ONE thing is not done yet.</p>
            <div className="btn-grid">
              <button type="button" className="btn focus-btn" onClick={() => setFocus({ ...focus, asking: false })}>Keep going</button>
              <button type="button" className="btn focus-outline" onClick={stop}>Stop</button>
            </div>
          </div>
        ) : (
          <div className="stack" style={{ width: '100%' }}>
            <button type="button" className="btn btn-block focus-btn" onClick={finish}>{focus.timeUp ? 'Yes, I finished it' : 'I finished it'}</button>
            <button type="button" className="btn focus-quiet" onClick={focus.timeUp ? stop : () => setFocus({ ...focus, asking: true })}>
              {focus.timeUp ? 'Not yet. Close focus' : 'Stop focus'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

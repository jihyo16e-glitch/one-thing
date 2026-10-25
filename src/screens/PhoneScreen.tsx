// Phone time (2026-10-25, APK only): like the laptop Life OS, but for the phone. Shows how long each app
// was in front today, which ones count as scrolling, a daily limit, and the floating bubble switch.
// Data comes from Android's own usage log (Usage access) and never leaves the phone.
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../app/AppContext';
import { openOverlaySettings, openUsageSettings } from '../app/focusLock';
import {
  canTrackPhone, openBatterySettings, phoneAccess, phoneUsage, scrollMs, startBubble, stopBubble, type BubbleConfig, type PhoneAccess, type Usage,
} from '../app/screenTime';
import type { AppData } from '../domain/types';
import { appDayStartMs, fmtMinutes, minutesOf } from '../domain/dates';
import { getDay, todayKey } from '../domain/rules';
import { Icon } from '../ui/Icon';

const SOFT_BTN = { background: 'var(--surface)', borderColor: 'var(--surface)', color: 'var(--accent-strong)', fontWeight: 700, flex: 'none' } as const;

/** What the bubble needs: the scroll apps, the limit, where the day starts, and today's ONE thing (shown at the limit). */
export function bubbleConfig(d: AppData): BubbleConfig {
  const p = d.settings.phone;
  return {
    apps: p.scrollApps, limitMin: p.limitMin, boundaryMin: minutesOf(d.settings.dayBoundary),
    one: getDay(d, todayKey(d))?.one.text ?? '', hardStop: p.hardStop,
  };
}

/** Access and today's app time, read now and each time the app comes back to the front (after the phone settings). */
function usePhoneToday(boundary: string) {
  const [access, setAccess] = useState<PhoneAccess | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const refresh = useCallback(async () => {
    const a = await phoneAccess();
    setAccess(a);
    setUsage(a.usage ? await phoneUsage(appDayStartMs(new Date(), boundary)) : null);
  }, [boundary]);
  useEffect(() => {
    if (!canTrackPhone()) return;
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);
  return { access, usage, refresh };
}

function level(ms: number, limitMin: number): '' | 'half' | 'over' {
  const part = ms / (limitMin * 60000);
  return part >= 1 ? 'over' : part >= 0.5 ? 'half' : '';
}

/** The small row on Today. Nothing in the web app. */
export function PhoneCard() {
  const { data, go } = useApp();
  const { access, usage } = usePhoneToday(data.settings.dayBoundary);
  if (!canTrackPhone() || !access) return null;
  const phone = data.settings.phone;
  if (!access.usage || !usage) {
    return (
      <section className="soft" aria-label="Phone time">
        <div className="stack" style={{ gap: 2, minWidth: 0 }}>
          <span className="soft-label">Phone time</span>
          <span>See how long you scroll each day.</span>
        </div>
        <button type="button" className="btn btn-sm" style={SOFT_BTN} onClick={() => go('phone')}>Set up</button>
      </section>
    );
  }
  const scroll = scrollMs(usage, phone.scrollApps);
  const over = level(scroll, phone.limitMin) === 'over';
  return (
    <section className="soft" aria-label="Phone time today" style={over ? { background: 'var(--warn-bg)' } : undefined}>
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="soft-label" style={over ? { color: 'var(--warn-ink)' } : undefined}>{over ? 'Over your scroll limit' : 'Scrolling today'}</span>
        <span>{fmtMinutes(scroll) + ' of ' + phone.limitMin + ' min · phone ' + fmtMinutes(usage.totalMs)}</span>
      </div>
      <button type="button" className="btn btn-sm" style={SOFT_BTN} onClick={() => go('phone')}>See</button>
    </section>
  );
}

export function PhoneScreen() {
  const { data, commit, go, toast } = useApp();
  const phone = data.settings.phone;
  const native = canTrackPhone();
  const { access, usage, refresh } = usePhoneToday(data.settings.dayBoundary);
  const [limit, setLimit] = useState(String(phone.limitMin));

  const back = (
    <button type="button" className="btn btn-sm btn-quiet" style={{ alignSelf: 'flex-start' }} onClick={() => go('today')}>
      <Icon name="back" size={20} width={2} />
      <span>Today</span>
    </button>
  );
  const header = <header className="head"><p className="sub">Today</p><h1>Phone time</h1></header>;

  if (!native) {
    return (
      <>
        {back}
        {header}
        <div className="notice"><p>Phone time works in the Android app. A web page cannot see other apps.</p></div>
      </>
    );
  }
  if (!access) return <>{back}{header}</>;

  async function toggleBubble() {
    if (phone.bubble) {
      stopBubble();
      commit((d) => { d.settings.phone.bubble = false; });
      toast('Bubble off.');
      refresh();
      return;
    }
    if (!(await startBubble(bubbleConfig(data)))) {
      toast('The bubble needs Usage access and Display over other apps.');
      return;
    }
    commit((d) => { d.settings.phone.bubble = true; });
    toast('Bubble on. Open a scroll app to see it.');
    refresh();
  }

  function toggleApp(pkg: string) {
    const on = commit((d) => {
      const list = d.settings.phone.scrollApps;
      const has = list.includes(pkg);
      d.settings.phone.scrollApps = has ? list.filter((x) => x !== pkg) : [...list, pkg];
      return !has;
    });
    toast(on ? 'Counts as scrolling now.' : 'Does not count as scrolling now.');
  }

  function saveLimit(e: FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(limit));
    if (!Number.isFinite(n) || n < 5 || n > 600) { toast('Pick a limit from 5 to 600 minutes.'); return; }
    commit((d) => { d.settings.phone.limitMin = n; });
    setLimit(String(n));
    toast('Limit saved: ' + n + ' minutes a day.');
  }

  const scroll = usage ? scrollMs(usage, phone.scrollApps) : 0;
  const lvl = level(scroll, phone.limitMin);
  const left = Math.max(0, Math.round(phone.limitMin - scroll / 60000));
  const apps = usage ? usage.apps.filter((a) => a.ms >= 60000).slice(0, 15) : [];
  const top = apps.length ? apps[0].ms : 1;

  return (
    <>
      {back}
      {header}

      {!access.usage && (
        <section className="card card-hi" aria-label="Turn on Usage access">
          <h2>Turn on Usage access</h2>
          <p className="sub">One Thing reads which app is open and for how long. It stays on this phone and is never sent anywhere.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={openUsageSettings}>Open Usage access</button>
          <p className="sub">Find One Thing in the list, switch it on, then come back.</p>
        </section>
      )}

      {usage && (
        <section className="card" aria-label="Scrolling today">
          <p className="eyebrow">Scrolling today</p>
          <p className="one-text">{fmtMinutes(scroll)}</p>
          <div className="meter" role="img" aria-label={Math.round(scroll / 60000) + ' of ' + phone.limitMin + ' minutes'}>
            <span className={lvl} style={{ width: Math.min(100, (scroll / (phone.limitMin * 60000)) * 100) + '%' }} />
          </div>
          <p className="sub">
            {lvl === 'over'
              ? 'Over your limit of ' + phone.limitMin + ' min. Your ONE thing is waiting.'
              : 'Limit ' + phone.limitMin + ' min. ' + left + ' min left.'}
          </p>
          <p className="sub">All phone time today: {fmtMinutes(usage.totalMs)}</p>
        </section>
      )}

      <section className="card" aria-label="Floating bubble">
        <h2>Floating bubble</h2>
        <p className="sub">
          A small bubble shows your scrolling minutes on top of scroll apps. It turns amber at half your limit and red at the
          limit. Tap it any time to come back to your ONE thing.
        </p>
        {!access.overlay ? (
          <>
            <button type="button" className="btn btn-primary" onClick={openOverlaySettings}>Turn on Display over other apps</button>
            <p className="sub">Find One Thing, switch it on, then come back.</p>
          </>
        ) : (
          <button type="button" className={'btn' + (phone.bubble ? '' : ' btn-primary')} aria-pressed={phone.bubble} onClick={toggleBubble}>
            {phone.bubble ? 'Turn the bubble off' : 'Turn the bubble on'}
          </button>
        )}
        <label className="check-row" style={{ alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            id="hard-stop"
            checked={phone.hardStop}
            onChange={(e) => {
              const on = e.target.checked;
              commit((d) => { d.settings.phone.hardStop = on; });
              toast(on ? 'At your limit, a pause screen covers the app.' : 'At your limit, only the bubble turns red.');
            }}
          />
          <span>
            <strong>Pause at my limit.</strong> A full screen covers the scroll app and shows your ONE thing. You can take 5 more
            minutes after a 5-second wait.
          </span>
        </label>
        {phone.bubble && access.overlay && !access.bubble && (
          <p className="sub" style={{ color: 'var(--warn-ink)', fontWeight: 700 }}>The bubble stopped (the phone closed it). Turn it off and on again.</p>
        )}
      </section>

      {phone.bubble && !access.battery && (
        <section className="notice" aria-label="Keep the bubble running">
          <p><strong>Battery saving may close the bubble.</strong> Set One Thing to {'“'}Don{'’'}t optimize{'”'} or {'“'}No restriction{'”'}.</p>
          <p>On Infinix, Tecno, Xiaomi and Oppo phones, also allow <strong>Auto-start</strong> for One Thing in the phone settings.</p>
          <div className="btn-row">
            <button type="button" className="btn btn-sm btn-dark" onClick={openBatterySettings}>Open battery settings</button>
          </div>
        </section>
      )}

      <section className="card" aria-label="Daily scroll limit">
        <form className="stack" onSubmit={saveLimit}>
          <label className="lbl" htmlFor="scroll-limit">Daily scroll limit (minutes)</label>
          <div className="inline-form">
            <input className="field" id="scroll-limit" type="number" inputMode="numeric" min={5} max={600} step={5} value={limit} onChange={(e) => setLimit(e.target.value)} />
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </section>

      {usage && (
        <section className="stack" aria-label="Apps today">
          <div className="row-between">
            <h2>Apps today</h2>
            <span className="count">tap to mark scroll apps</span>
          </div>
          {apps.length ? apps.map((a) => {
            const isScroll = phone.scrollApps.includes(a.pkg);
            return (
              <div className="app-row" key={a.pkg}>
                <div className="app-name">
                  <span className="goal-title">{a.label}</span>
                  <span className="count">{fmtMinutes(a.ms) + ' · opened ' + a.opens + (a.opens === 1 ? ' time' : ' times')}</span>
                  <div className="meter"><span className={isScroll ? 'over' : ''} style={{ width: (a.ms / top) * 100 + '%' }} /></div>
                </div>
                <button
                  type="button"
                  className={'btn chip btn-sm' + (isScroll ? ' btn-chosen' : '')}
                  aria-pressed={isScroll}
                  aria-label={'Scroll app: ' + a.label}
                  onClick={() => toggleApp(a.pkg)}
                >
                  Scroll
                </button>
              </div>
            );
          }) : <p className="placeholder">No app used for a full minute yet today.</p>}
        </section>
      )}
    </>
  );
}
